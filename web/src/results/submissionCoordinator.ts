import type { ProteinFactorySubmissionAttempt } from './appsScriptMapper'
import {
  BrowserResultRepository,
  isFinalResult,
  isPersistedSubmissionItem,
  type PersistenceDurability,
  type RecoverySnapshot,
  type ResultRepository,
} from './resultRepository'
import { isValidCheckpointEnvelopeV4 } from './localResultSaver'
import {
  queueSubmission,
  readSubmissionQueue,
  retryPendingSubmissions,
  type SubmissionQueueItem,
  type SubmissionStatus,
} from './submissionQueue'
import type { CheckpointEnvelopeV4, FinalGamePayload, GameSessionState } from '../types'

const checkpointSchemaVersion = 'protein-factory-checkpoint-v4' as const
const recoverySchemaVersion = 'protein-factory-recovery-v1' as const

export interface AttemptSubmissionState {
  durability: PersistenceDurability
  error?: string
  guarded: boolean
  status: SubmissionStatus
}

export interface SubmissionCoordinatorOptions {
  endpoint?: string
  fetcher?: typeof fetch
  isOnline?: () => boolean
  now?: () => number
  repository?: ResultRepository
  timerHost?: Pick<typeof globalThis, 'clearTimeout' | 'setTimeout'>
}

type AttemptListener = (state: AttemptSubmissionState) => void

export class SubmissionCoordinator {
  private readonly endpoint?: string
  private readonly fetcher?: typeof fetch
  private readonly isOnline?: () => boolean
  private readonly now: () => number
  private readonly repository: ResultRepository
  private readonly timerHost: Pick<typeof globalThis, 'clearTimeout' | 'setTimeout'>
  private readonly listeners = new Map<string, Set<AttemptListener>>()
  private readonly states = new Map<string, AttemptSubmissionState>()
  private guardedAttempts = new Set<string>()
  private checkpointWrites: Promise<void> = Promise.resolve()
  private started = false
  private timer: ReturnType<typeof setTimeout> | null = null

  constructor(options: SubmissionCoordinatorOptions = {}) {
    this.repository = options.repository ?? new BrowserResultRepository()
    this.endpoint = options.endpoint
    this.fetcher = options.fetcher
    this.isOnline = options.isOnline
    this.now = options.now ?? Date.now
    this.timerHost = options.timerHost ?? globalThis
  }

  get durability(): PersistenceDurability {
    return this.repository.durability
  }

  async start(): Promise<void> {
    if (this.started) return
    this.started = true
    await this.repository.initialize()
    for (const item of await readSubmissionQueue(this.repository)) this.publish(item)
    if (typeof window !== 'undefined') window.addEventListener('online', this.handleOnline)
    if (typeof document !== 'undefined') document.addEventListener('visibilitychange', this.handleVisibility)
    void this.wake('startup').catch((error) => {
      console.warn(`Startup submission retry failed: ${error instanceof Error ? error.message : 'Unknown error.'}`)
    })
  }

  stop(): void {
    if (!this.started) return
    this.started = false
    if (typeof window !== 'undefined') {
      window.removeEventListener('online', this.handleOnline)
      window.removeEventListener('beforeunload', this.handleBeforeUnload)
    }
    if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', this.handleVisibility)
    if (this.timer) this.timerHost.clearTimeout(this.timer)
    this.timer = null
  }

  async getCheckpoint(): Promise<CheckpointEnvelopeV4 | null> {
    await this.repository.initialize()
    return this.repository.getCheckpoint()
  }

  async saveCheckpoint(state: GameSessionState): Promise<AttemptSubmissionState> {
    const write = this.checkpointWrites.then(() => this.repository.putCheckpoint({
        savedAt: new Date(this.now()).toISOString(),
        schemaVersion: checkpointSchemaVersion,
        state,
      }))
    this.checkpointWrites = write.catch(() => {})
    await write
    return this.getAttemptState(state.attemptId)
  }

  async clearCheckpoint(): Promise<void> {
    const write = this.checkpointWrites.then(() => this.repository.clearCheckpoint())
    this.checkpointWrites = write.catch(() => {})
    await write
  }

  async completeAttempt(
    result: FinalGamePayload,
    attempt: ProteinFactorySubmissionAttempt,
  ): Promise<AttemptSubmissionState> {
    if (result.attemptId !== attempt.attemptId) throw new Error('Result and submission attempt IDs do not match.')
    await this.repository.putResult(result)
    const item = await queueSubmission(attempt, this.repository, this.now())
    this.setGuarded(item.attemptId, this.repository.durability === 'memory-only' && item.status !== 'submitted')
    this.publish(item)
    void this.wake('completed')
    return this.getAttemptState(item.attemptId)
  }

  async retry(attemptId?: string): Promise<void> {
    await this.wake('manual', true, attemptId)
    if (attemptId) {
      const item = (await readSubmissionQueue(this.repository)).find((entry) => entry.attemptId === attemptId)
      if (item) this.publish(item)
    }
  }

  getAttemptState(attemptId: string): AttemptSubmissionState {
    return this.states.get(attemptId) ?? {
      durability: this.repository.durability,
      guarded: this.guardedAttempts.has(attemptId),
      status: 'queued',
    }
  }

  subscribe(attemptId: string, listener: AttemptListener): () => void {
    const attemptListeners = this.listeners.get(attemptId) ?? new Set<AttemptListener>()
    attemptListeners.add(listener)
    this.listeners.set(attemptId, attemptListeners)
    listener(this.getAttemptState(attemptId))
    return () => {
      attemptListeners.delete(listener)
      if (attemptListeners.size === 0) this.listeners.delete(attemptId)
    }
  }

  confirmLeave(attemptId: string): boolean {
    if (!this.guardedAttempts.has(attemptId) || typeof window === 'undefined') return true
    return window.confirm('This result only exists in this tab. Leave without saving it to a recovery file?')
  }

  async exportRecoveryJson(): Promise<string> {
    const snapshot = await this.snapshot()
    return JSON.stringify({
      ...snapshot,
      exportedAt: new Date(this.now()).toISOString(),
      schemaVersion: recoverySchemaVersion,
    }, null, 2)
  }

  async downloadRecoveryJson(): Promise<void> {
    const json = await this.exportRecoveryJson()
    if (typeof document === 'undefined') return
    const blobUrl = URL.createObjectURL(new Blob([json], { type: 'application/json' }))
    const anchor = document.createElement('a')
    anchor.download = `protein-factory-recovery-${new Date(this.now()).toISOString().replace(/[:.]/g, '-')}.json`
    anchor.href = blobUrl
    anchor.click()
    URL.revokeObjectURL(blobUrl)
  }

  async importRecoveryJson(json: string): Promise<void> {
    const parsed: unknown = JSON.parse(json)
    if (!isRecoveryFile(parsed)) throw new Error('This is not a Protein Factory recovery file.')

    const current = await this.snapshot()
    const queue = mergeByAttemptId(current.queue, parsed.queue)
    const results = mergeByAttemptId(current.results, parsed.results)
    const checkpoint = current.checkpoint ?? parsed.checkpoint
    try {
      await this.repository.replaceRecoverySnapshot({ checkpoint, queue, results })
    } catch (error) {
      try {
        await this.repository.replaceRecoverySnapshot(current)
      } catch {
        // Preserve the original import failure; repository replacements are atomic.
      }
      throw error
    }
    for (const item of queue) {
      this.setGuarded(item.attemptId, this.repository.durability === 'memory-only' && item.status !== 'submitted')
      this.publish(item as SubmissionQueueItem)
    }
    await this.wake('import')
  }

  private async snapshot(): Promise<RecoverySnapshot> {
    return {
      checkpoint: await this.repository.getCheckpoint(),
      queue: await this.repository.getQueue(),
      results: await this.repository.getResults(),
    }
  }

  private async wake(_reason: string, force = false, attemptId?: string): Promise<void> {
    if (!this.started && _reason !== 'manual') return
    const items = await retryPendingSubmissions({
      endpoint: this.endpoint,
      attemptId,
      fetcher: this.fetcher,
      force,
      isOnline: this.isOnline,
      now: this.now,
      onStatusChange: (item) => this.publish(item),
      repository: this.repository,
    })
    for (const item of items) this.publish(item)
    this.schedule(items)
  }

  private schedule(items: SubmissionQueueItem[]): void {
    if (this.timer) this.timerHost.clearTimeout(this.timer)
    this.timer = null
    const nextRetry = items
      .filter((item) => item.status !== 'submitted' && item.status !== 'failed-terminal' && item.nextRetryAt)
      .map((item) => Date.parse(item.nextRetryAt as string))
      .filter(Number.isFinite)
      .sort((left, right) => left - right)[0]
    if (nextRetry === undefined) return
    const delay = Math.max(0, nextRetry - this.now())
    this.timer = this.timerHost.setTimeout(() => { void this.wake('timer') }, delay)
  }

  private publish(item: SubmissionQueueItem): void {
    if (item.status === 'submitted') this.setGuarded(item.attemptId, false)
    const state: AttemptSubmissionState = {
      durability: item.durability,
      error: item.error,
      guarded: this.guardedAttempts.has(item.attemptId),
      status: item.status,
    }
    this.states.set(item.attemptId, state)
    for (const listener of this.listeners.get(item.attemptId) ?? []) listener(state)
  }

  private setGuarded(attemptId: string, guarded: boolean): void {
    if (guarded) this.guardedAttempts.add(attemptId)
    else this.guardedAttempts.delete(attemptId)
    if (typeof window === 'undefined') return
    window.removeEventListener('beforeunload', this.handleBeforeUnload)
    if (this.guardedAttempts.size > 0) window.addEventListener('beforeunload', this.handleBeforeUnload)
  }

  private readonly handleOnline = () => { void this.wake('online') }
  private readonly handleVisibility = () => {
    if (typeof document === 'undefined' || document.visibilityState === 'visible') void this.wake('visibility')
  }
  private readonly handleBeforeUnload = (event: BeforeUnloadEvent) => {
    if (this.guardedAttempts.size === 0) return
    event.preventDefault()
    event.returnValue = ''
  }
}

export const submissionCoordinator = new SubmissionCoordinator()

function mergeByAttemptId<T extends { attemptId: string }>(current: T[], imported: T[]): T[] {
  const seen = new Set(current.map((item) => item.attemptId))
  return [...current, ...imported.filter((item) => !seen.has(item.attemptId))]
}

function isRecoveryFile(value: unknown): value is RecoverySnapshot & { exportedAt: string, schemaVersion: typeof recoverySchemaVersion } {
  return isRecord(value) && value.schemaVersion === recoverySchemaVersion &&
    isIsoDate(value.exportedAt) &&
    (value.checkpoint === null || isCheckpoint(value.checkpoint)) && Array.isArray(value.queue) &&
    value.queue.every(isQueueItem) && hasUniqueAttemptIds(value.queue) && Array.isArray(value.results) &&
    value.results.every(isResult) && hasUniqueAttemptIds(value.results)
}

function isQueueItem(value: unknown): value is SubmissionQueueItem {
  if (!isPersistedSubmissionItem(value) || !isSubmissionStatus(value.status)) return false
  if (value.status === 'retry-scheduled' && value.nextRetryAt === undefined) return false
  if ((value.status === 'submitted' || value.status === 'failed-terminal') && value.nextRetryAt !== undefined) return false
  return true
}

function isSubmissionStatus(value: unknown): value is SubmissionStatus {
  return ['local-draft', 'queued', 'saving', 'submitted', 'waiting-for-connection', 'retry-scheduled', 'failed-terminal', 'failed'].includes(String(value))
}

function isResult(value: unknown): value is FinalGamePayload {
  return isFinalResult(value)
}

function isCheckpoint(value: unknown): value is CheckpointEnvelopeV4 {
  return isValidCheckpointEnvelopeV4(value)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function hasUniqueAttemptIds(values: Array<{ attemptId: string }>): boolean {
  return new Set(values.map((value) => value.attemptId)).size === values.length
}

function isIsoDate(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) &&
    Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value
}
