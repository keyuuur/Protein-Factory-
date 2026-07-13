import { afterEach, describe, expect, it, vi } from 'vitest'
import { createInitialGameState, gameReducer } from '../../src/game/simulation/gameReducer'
import { buildFinalPayload } from '../../src/results/gameResults'
import type { ProteinFactoryAttemptV3 } from '../../src/results/appsScriptMapper'
import {
  BrowserResultRepository,
  MemoryResultRepository,
  type PersistedSubmissionItem,
  type RecoverySnapshot,
} from '../../src/results/resultRepository'
import { SubmissionCoordinator } from '../../src/results/submissionCoordinator'
import type { CheckpointEnvelopeV4, FinalGamePayload, GameSessionState } from '../../src/types'

describe('BrowserResultRepository failure recovery', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('reconciles the complete fallback snapshot before a reload trusts stale IndexedDB', async () => {
    const indexedDb = new FakeIndexedDb()
    const storage = controlledStorage()
    stubBrowser(indexedDb, storage)
    const oldState = startedState('pf-old-authoritative')
    const newState = startedState('pf-new-authoritative')
    const oldResult = completedResult(oldState.attemptId)
    const newResult = completedResult(newState.attemptId)
    const oldQueue = queueItem(oldResult, 'submitted')
    const newQueue = queueItem(newResult, 'queued')

    const first = new BrowserResultRepository()
    await first.initialize()
    await first.putQueue([oldQueue])
    await first.putResult(oldResult)
    await first.putCheckpoint(checkpoint(oldState))

    indexedDb.failNextWrite = true
    await first.putQueue([newQueue, oldQueue])
    await first.putResult(newResult)
    await first.putCheckpoint(checkpoint(newState))
    expect(first.durability).toBe('local-storage')

    const reloaded = new BrowserResultRepository()
    await reloaded.initialize()
    expect(reloaded.durability).toBe('indexeddb')
    expect((await reloaded.getQueue()).map((item) => item.attemptId)).toEqual([
      newResult.attemptId,
      oldResult.attemptId,
    ])
    expect((await reloaded.getResults()).map((item) => item.attemptId)).toEqual([
      newResult.attemptId,
      oldResult.attemptId,
    ])
    expect((await reloaded.getCheckpoint())?.state.attemptId).toBe(newState.attemptId)

    const secondReload = new BrowserResultRepository()
    await secondReload.initialize()
    expect((await secondReload.getCheckpoint())?.state.attemptId).toBe(newState.attemptId)
    expect((await secondReload.getQueue())[0].attemptId).toBe(newResult.attemptId)
  })

  it('keeps the authoritative shadow in memory when IndexedDB fails and localStorage is denied', async () => {
    const indexedDb = new FakeIndexedDb()
    const storage = controlledStorage()
    stubBrowser(indexedDb, storage)
    const state = startedState('pf-memory-fallback')
    const result = completedResult(state.attemptId)
    const repository = new BrowserResultRepository()
    await repository.initialize()
    await repository.putResult(result)

    storage.denied = true
    indexedDb.failNextWrite = true
    await repository.putQueue([queueItem(result, 'queued')])

    expect(repository.durability).toBe('memory-only')
    expect((await repository.getResults())[0]).toEqual(result)
    expect((await repository.getQueue())[0].attemptId).toBe(result.attemptId)
  })
})

describe('recovery import validation and rollback', () => {
  it('preserves valid V3 and V4 queue payloads', async () => {
    const repository = new MemoryResultRepository()
    const coordinator = new SubmissionCoordinator({ isOnline: () => false, repository })
    const result = completedResult('pf-valid-v4-import')
    const v3 = legacyAttempt('pf-valid-v3-import')
    const recovery = recoveryFile({
      checkpoint: null,
      queue: [queueItem(v3, 'queued'), queueItem(result, 'queued')],
      results: [result],
    })

    await coordinator.importRecoveryJson(JSON.stringify(recovery))

    expect((await repository.getQueue()).map((item) => item.attempt.schemaVersion)).toEqual([
      'protein-factory-attempt-v3',
      'protein-factory-v4',
    ])
  })

  it.each([
    ['queue payload', (file: RecoveryFile) => {
      const attempt = file.queue[0].attempt as FinalGamePayload
      const round = attempt.runManifest.rounds[0]
      if (round.type !== 'transcription') throw new Error('Expected transcription fixture')
      round.answer = `${round.answer}U`
    }],
    ['retry date', (file: RecoveryFile) => { file.queue[0].nextRetryAt = '2026-02-31T12:00:00.000Z' }],
    ['result payload', (file: RecoveryFile) => { file.results[0].completedProducts = [{}] as FinalGamePayload['completedProducts'] }],
    ['checkpoint reachability', (file: RecoveryFile) => {
      if (!file.checkpoint) throw new Error('Expected checkpoint fixture')
      file.checkpoint.state.screen = 'end'
      file.checkpoint.state.completedAt = 2_000
    }],
  ])('rejects an invalid %s before any repository write', async (_label, mutate) => {
    const repository = new TrackingRepository()
    const coordinator = new SubmissionCoordinator({ isOnline: () => false, repository })
    const state = startedState('pf-invalid-import')
    const result = completedResult(state.attemptId)
    const file = recoveryFile({
      checkpoint: checkpoint(state),
      queue: [queueItem(result, 'retry-scheduled', '2026-07-13T12:05:00.000Z')],
      results: [result],
    })
    mutate(file)

    await expect(coordinator.importRecoveryJson(JSON.stringify(file))).rejects.toThrow(
      'This is not a Protein Factory recovery file.',
    )
    expect(repository.replaceCalls).toBe(0)
    expect(await repository.getQueue()).toEqual([])
  })

  it('rolls back the prior snapshot if repository replacement throws after a partial write', async () => {
    const currentResult = completedResult('pf-current-result')
    const importedResult = completedResult('pf-imported-result')
    const repository = new FailOnceRepository()
    await repository.putQueue([queueItem(currentResult, 'queued')])
    await repository.putResult(currentResult)
    const coordinator = new SubmissionCoordinator({ isOnline: () => false, repository })
    const file = recoveryFile({
      checkpoint: null,
      queue: [queueItem(importedResult, 'queued')],
      results: [importedResult],
    })

    await expect(coordinator.importRecoveryJson(JSON.stringify(file))).rejects.toThrow('Injected replacement failure')

    expect((await repository.getQueue()).map((item) => item.attemptId)).toEqual([currentResult.attemptId])
    expect((await repository.getResults()).map((item) => item.attemptId)).toEqual([currentResult.attemptId])
  })
})

interface RecoveryFile extends RecoverySnapshot {
  exportedAt: string
  schemaVersion: 'protein-factory-recovery-v1'
}

class TrackingRepository extends MemoryResultRepository {
  replaceCalls = 0

  override async replaceRecoverySnapshot(snapshot: RecoverySnapshot): Promise<void> {
    this.replaceCalls += 1
    await super.replaceRecoverySnapshot(snapshot)
  }
}

class FailOnceRepository extends MemoryResultRepository {
  private shouldFail = true

  override async replaceRecoverySnapshot(snapshot: RecoverySnapshot): Promise<void> {
    await super.replaceRecoverySnapshot(snapshot)
    if (this.shouldFail) {
      this.shouldFail = false
      throw new Error('Injected replacement failure')
    }
  }
}

class FakeIndexedDb {
  failNextWrite = false
  readonly records = new Map<string, unknown>()
  private created = false

  open(): IDBOpenDBRequest {
    const request = {} as IDBOpenDBRequest
    queueMicrotask(() => {
      const database = new FakeDatabase(this) as unknown as IDBDatabase
      Object.defineProperty(request, 'result', { configurable: true, value: database })
      if (!this.created) {
        this.created = true
        request.onupgradeneeded?.(new Event('upgradeneeded') as IDBVersionChangeEvent)
      }
      request.onsuccess?.(new Event('success'))
    })
    return request
  }
}

class FakeDatabase {
  readonly objectStoreNames = { contains: () => true } as DOMStringList

  constructor(private readonly indexedDb: FakeIndexedDb) {}

  close(): void {}
  createObjectStore(): IDBObjectStore { return {} as IDBObjectStore }

  transaction(_store: string, mode: IDBTransactionMode): IDBTransaction {
    const transaction = new FakeTransaction(this.indexedDb, mode)
    return transaction as unknown as IDBTransaction
  }
}

class FakeTransaction {
  error: DOMException | null = null
  onabort: ((this: IDBTransaction, ev: Event) => unknown) | null = null
  oncomplete: ((this: IDBTransaction, ev: Event) => unknown) | null = null
  onerror: ((this: IDBTransaction, ev: Event) => unknown) | null = null
  readonly draft: Map<string, unknown>

  constructor(private readonly indexedDb: FakeIndexedDb, private readonly mode: IDBTransactionMode) {
    this.draft = new Map([...indexedDb.records].map(([key, value]) => [key, structuredClone(value)]))
    setTimeout(() => {
      if (mode === 'readwrite' && indexedDb.failNextWrite) {
        indexedDb.failNextWrite = false
        this.error = new DOMException('Injected transaction failure', 'AbortError')
        this.onabort?.call(this as unknown as IDBTransaction, new Event('abort'))
        return
      }
      if (mode === 'readwrite') {
        indexedDb.records.clear()
        for (const [key, value] of this.draft) indexedDb.records.set(key, structuredClone(value))
      }
      this.oncomplete?.call(this as unknown as IDBTransaction, new Event('complete'))
    }, 0)
  }

  objectStore(): IDBObjectStore {
    return new FakeObjectStore(this) as unknown as IDBObjectStore
  }
}

class FakeObjectStore {
  constructor(private readonly transaction: FakeTransaction) {}

  clear(): IDBRequest<undefined> {
    this.transaction.draft.clear()
    return {} as IDBRequest<undefined>
  }

  delete(key: IDBValidKey): IDBRequest<undefined> {
    this.transaction.draft.delete(String(key))
    return {} as IDBRequest<undefined>
  }

  get(key: IDBValidKey): IDBRequest<unknown> {
    const request = {} as IDBRequest<unknown>
    queueMicrotask(() => {
      Object.defineProperty(request, 'result', {
        configurable: true,
        value: structuredClone(this.transaction.draft.get(String(key))),
      })
      request.onsuccess?.(new Event('success'))
    })
    return request
  }

  put(value: unknown, key?: IDBValidKey): IDBRequest<IDBValidKey> {
    this.transaction.draft.set(String(key), structuredClone(value))
    return {} as IDBRequest<IDBValidKey>
  }
}

function stubBrowser(indexedDb: FakeIndexedDb, storage: ControlledStorage): void {
  vi.stubGlobal('indexedDB', indexedDb as unknown as IDBFactory)
  vi.stubGlobal('window', { localStorage: storage })
}

interface ControlledStorage extends Storage {
  denied: boolean
}

function controlledStorage(): ControlledStorage {
  const values = new Map<string, string>()
  return {
    denied: false,
    clear() { if (this.denied) throw new DOMException('Denied', 'SecurityError'); values.clear() },
    getItem(key) { if (this.denied) throw new DOMException('Denied', 'SecurityError'); return values.get(key) ?? null },
    key(index) { return [...values.keys()][index] ?? null },
    get length() { return values.size },
    removeItem(key) { if (this.denied) throw new DOMException('Denied', 'SecurityError'); values.delete(key) },
    setItem(key, value) { if (this.denied) throw new DOMException('Denied', 'SecurityError'); values.set(key, value) },
  }
}

function startedState(attemptId: string): GameSessionState {
  let state = createInitialGameState(1_000)
  state = gameReducer(state, {
    type: 'START_GAME',
    demoMode: false,
    firstName: 'Ada',
    period: '2',
    settings: { replayMode: 'full', soundEnabled: false, supportMode: 'guided' },
    now: 1_000,
  })
  state = gameReducer(state, { type: 'START_ROUNDS' })
  return { ...state, attemptId }
}

function completedResult(attemptId: string): FinalGamePayload {
  let state = startedState(attemptId)
  while (state.screen === 'playing' || state.screen === 'sequence-transition') {
    if (!state.roundResults.some((result) => result.round === state.currentRoundIndex + 1)) {
      state = completeCurrentAction(state)
    }
    state = gameReducer(state, { type: 'CONTINUE_AFTER_SUCCESS', now: 20_000 + state.currentRoundIndex * 1_000 })
  }
  return buildFinalPayload(state)
}

function completeCurrentAction(state: GameSessionState): GameSessionState {
  const round = state.runManifest.rounds[state.currentRoundIndex]
  let next = state
  if (round.type === 'transcription') {
    next = [...round.answer].reduce((current, base) => gameReducer(current, { type: 'APPEND_BASE', base }), next)
    return gameReducer(next, { type: 'CHECK_BASE_ROUND' })
  }
  if (round.type === 'translation') {
    for (let index = next.roundState.currentCodonIndex; index < round.answers.length; index += 1) {
      next = gameReducer(next, { type: 'SELECT_TRANSLATION', index, value: round.answers[index] })
      next = gameReducer(next, { type: 'CHECK_TRANSLATION_CODON' })
    }
    return next
  }
  next = gameReducer(next, { type: 'SELECT_FUNCTION_ROW', rowId: round.correctRowId })
  return gameReducer(next, { type: 'CHECK_FUNCTION_ROW' })
}

function checkpoint(state: GameSessionState): CheckpointEnvelopeV4 {
  return {
    savedAt: '2026-07-13T12:00:00.000Z',
    schemaVersion: 'protein-factory-checkpoint-v4',
    state,
  }
}

function queueItem(
  attempt: FinalGamePayload | ProteinFactoryAttemptV3,
  status: PersistedSubmissionItem['status'],
  nextRetryAt?: string,
): PersistedSubmissionItem {
  return {
    attempt,
    attemptId: attempt.attemptId,
    createdAt: '2026-07-13T12:00:00.000Z',
    durability: 'indexeddb',
    nextRetryAt,
    retryCount: nextRetryAt ? 1 : 0,
    status,
    updatedAt: '2026-07-13T12:00:00.000Z',
  }
}

function legacyAttempt(attemptId: string): ProteinFactoryAttemptV3 {
  return {
    attemptId,
    classPeriod: '2',
    contentVersion: 'protein-factory-v3',
    durationSeconds: 30,
    independentCount: 0,
    isDemo: false,
    maxScore: 8,
    misconceptions: [],
    orderPair: { orderIds: ['first', 'second'], pairId: 'pair' },
    productionRating: 'Recalibration',
    repairs: 0,
    schemaVersion: 'protein-factory-attempt-v3',
    score: 0,
    seed: 'seed',
    stageResults: [],
    studentName: 'Ada',
    submittedAt: '2026-07-13T12:00:00.000Z',
    supportCount: 0,
    transferResults: [],
    variantEffect: 'no-change',
  }
}

function recoveryFile(snapshot: RecoverySnapshot): RecoveryFile {
  return {
    ...structuredClone(snapshot),
    exportedAt: '2026-07-13T12:00:00.000Z',
    schemaVersion: 'protein-factory-recovery-v1',
  }
}
