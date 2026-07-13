import { describe, expect, it, vi } from 'vitest'
import {
  toProteinFactoryAttemptV4,
  type ProteinFactoryAttemptV3,
  type ProteinFactorySubmissionAttempt,
} from '../../src/results/appsScriptMapper'
import { MemoryResultRepository } from '../../src/results/resultRepository'
import {
  queueSubmission,
  readSubmissionQueue,
  retryDelayMs,
  retryPendingSubmissions,
} from '../../src/results/submissionQueue'
import { SubmissionCoordinator } from '../../src/results/submissionCoordinator'
import { createInitialGameState, gameReducer } from '../../src/game/simulation/gameReducer'
import { buildFinalPayload } from '../../src/results/gameResults'
import type { FinalGamePayload, GameSessionState, ProteinFactoryAttemptV4 } from '../../src/types'

describe('submission queue V2', () => {
  it('keys solely by immutable attempt ID and keeps the first payload', async () => {
    const repository = new MemoryResultRepository('local-storage')
    const original = v4Attempt('pf-immutable', { attemptKind: 'full' })
    const replay = v4Attempt('pf-immutable', { attemptKind: 'targeted', parentAttemptId: 'parent' })

    await queueSubmission(original, repository, 1_000)
    await queueSubmission(replay, repository, 2_000)

    const items = await readSubmissionQueue(repository)
    expect(items).toHaveLength(1)
    expect(items[0].attempt).toEqual(original)
    expect(items[0].durability).toBe('local-storage')
  })

  it('preserves and submits mixed V3 and V4 payloads', async () => {
    const repository = new MemoryResultRepository('indexeddb')
    await queueSubmission(v3Attempt('pf-v3-mixed'), repository)
    await queueSubmission(v4Attempt('pf-v4-mixed'), repository)
    const submittedSchemas: string[] = []

    const results = await retryPendingSubmissions({
      fetcher: async (_input, init) => {
        const body = JSON.parse(String(init?.body)) as { attempt: ProteinFactorySubmissionAttempt }
        submittedSchemas.push(body.attempt.schemaVersion)
        return jsonResponse({ ok: true }, 200)
      },
      isOnline: () => true,
      repository,
    })

    expect(submittedSchemas.sort()).toEqual(['protein-factory-attempt-v3', 'protein-factory-v4'])
    expect(results.every((item) => item.status === 'submitted')).toBe(true)
  })

  it('uses the bounded retry policy for network and retryable HTTP failures', async () => {
    const repository = new MemoryResultRepository()
    let now = 10_000
    await queueSubmission(v4Attempt('pf-retry'), repository, now)

    let results = await retryPendingSubmissions({
      fetcher: async () => jsonResponse({ error: 'Busy' }, 429),
      isOnline: () => true,
      now: () => now,
      repository,
    })
    expect(results[0]).toMatchObject({ retryCount: 1, status: 'retry-scheduled' })
    expect(Date.parse(results[0].nextRetryAt ?? '')).toBe(now + 5_000)

    now += 5_000
    results = await retryPendingSubmissions({
      fetcher: async () => { throw new TypeError('Network failed') },
      isOnline: () => true,
      now: () => now,
      repository,
    })
    expect(results[0]).toMatchObject({ retryCount: 2, status: 'waiting-for-connection' })
    expect(Date.parse(results[0].nextRetryAt ?? '')).toBe(now + 15_000)
    expect([1, 2, 3, 4, 5, 6].map(retryDelayMs)).toEqual([5_000, 15_000, 60_000, 300_000, 900_000, 900_000])
  })

  it('marks non-retryable 4xx responses terminal', async () => {
    const repository = new MemoryResultRepository()
    await queueSubmission(v4Attempt('pf-invalid'), repository)

    const results = await retryPendingSubmissions({
      fetcher: async () => jsonResponse({ error: 'Invalid attempt.' }, 422),
      isOnline: () => true,
      repository,
    })

    expect(results[0]).toMatchObject({ error: 'Invalid attempt.', retryCount: 1, status: 'failed-terminal' })
    expect(results[0].nextRetryAt).toBeUndefined()
  })

  it('honors a structured non-retryable response even when the proxy returns 502', async () => {
    const repository = new MemoryResultRepository()
    await queueSubmission(v4Attempt('pf-permanent-upstream'), repository)

    const results = await retryPendingSubmissions({
      fetcher: async () => jsonResponse({ error: 'Teacher storage configuration rejected.', retryable: false }, 502),
      isOnline: () => true,
      repository,
    })

    expect(results[0]).toMatchObject({ retryCount: 1, status: 'failed-terminal' })
    expect(results[0].nextRetryAt).toBeUndefined()
  })

  it('rescans for an attempt queued while a request is active', async () => {
    const repository = new MemoryResultRepository()
    await queueSubmission(v4Attempt('pf-first'), repository)
    const submittedIds: string[] = []

    const results = await retryPendingSubmissions({
      fetcher: async (_input, init) => {
        const body = JSON.parse(String(init?.body)) as { attempt: ProteinFactorySubmissionAttempt }
        submittedIds.push(body.attempt.attemptId)
        if (body.attempt.attemptId === 'pf-first') await queueSubmission(v4Attempt('pf-during-drain'), repository)
        return jsonResponse({ ok: true }, 200)
      },
      isOnline: () => true,
      repository,
    })

    expect(submittedIds).toEqual(['pf-first', 'pf-during-drain'])
    expect(results.map((item) => item.status)).toEqual(['submitted', 'submitted'])
  })

  it('runs a filtered follow-up drain when another filtered attempt is active', async () => {
    const repository = new MemoryResultRepository()
    await queueSubmission(v4Attempt('pf-filter-a'), repository)
    const submittedIds: string[] = []
    let releaseFirst = () => {}
    const firstBlocked = new Promise<void>((resolve) => { releaseFirst = resolve })
    let markFirstStarted = () => {}
    const firstStarted = new Promise<void>((resolve) => { markFirstStarted = resolve })
    const fetcher = async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as { attempt: ProteinFactorySubmissionAttempt }
      submittedIds.push(body.attempt.attemptId)
      if (body.attempt.attemptId === 'pf-filter-a') {
        markFirstStarted()
        await firstBlocked
      }
      return jsonResponse({ ok: true }, 200)
    }

    const firstDrain = retryPendingSubmissions({ attemptId: 'pf-filter-a', fetcher, isOnline: () => true, repository })
    await firstStarted
    await queueSubmission(v4Attempt('pf-filter-b'), repository)
    const secondDrain = retryPendingSubmissions({ attemptId: 'pf-filter-b', fetcher, isOnline: () => true, repository })
    releaseFirst()
    await Promise.all([firstDrain, secondDrain])

    expect(submittedIds).toEqual(['pf-filter-a', 'pf-filter-b'])
    expect((await readSubmissionQueue(repository)).find((item) => item.attemptId === 'pf-filter-b')?.status).toBe('submitted')
  })

  it('does not count an offline wake as a network try', async () => {
    const repository = new MemoryResultRepository()
    await queueSubmission(v4Attempt('pf-offline'), repository)

    const results = await retryPendingSubmissions({ isOnline: () => false, repository })

    expect(results[0]).toMatchObject({ retryCount: 0, status: 'waiting-for-connection' })
  })
})

describe('submission coordinator recovery', () => {
  it('guards a memory-only result and round-trips recovery JSON', async () => {
    const repository = new MemoryResultRepository()
    const fetcher = vi.fn(async () => { throw new TypeError('Offline') })
    const coordinator = new SubmissionCoordinator({ fetcher, isOnline: () => true, repository })
    await coordinator.start()
    const result = completedResult()

    await coordinator.completeAttempt(result, toProteinFactoryAttemptV4(result))
    await vi.waitFor(() => expect(coordinator.getAttemptState(result.attemptId).guarded).toBe(true))
    const recoveryJson = await coordinator.exportRecoveryJson()
    coordinator.stop()

    const restoredRepository = new MemoryResultRepository()
    const restored = new SubmissionCoordinator({ isOnline: () => false, repository: restoredRepository })
    await restored.importRecoveryJson(recoveryJson)

    expect((await restoredRepository.getResults())[0].attemptId).toBe(result.attemptId)
    expect((await restoredRepository.getQueue())[0].attemptId).toBe(result.attemptId)
    restored.stop()
  })

  it('stores checkpoints by state attempt ID', async () => {
    const repository = new MemoryResultRepository()
    const coordinator = new SubmissionCoordinator({ isOnline: () => false, repository })
    const state = { attemptId: 'pf-checkpoint' } as GameSessionState

    await coordinator.saveCheckpoint(state)

    expect((await coordinator.getCheckpoint())?.state.attemptId).toBe('pf-checkpoint')
  })
})

function v3Attempt(attemptId: string): ProteinFactoryAttemptV3 {
  return { attemptId, schemaVersion: 'protein-factory-attempt-v3' } as ProteinFactoryAttemptV3
}

function v4Attempt(attemptId: string, extra: Record<string, unknown> = {}): ProteinFactoryAttemptV4 {
  return { attemptId, schemaVersion: 'protein-factory-v4', ...extra } as ProteinFactoryAttemptV4
}

function completedResult(): FinalGamePayload {
  let state = createInitialGameState(1_000)
  state = gameReducer(state, {
    demoMode: false,
    firstName: 'Ada',
    now: 1_000,
    period: '2',
    settings: { replayMode: 'full', soundEnabled: false, supportMode: 'guided' },
    type: 'START_GAME',
  })
  state = gameReducer(state, { type: 'START_ROUNDS' })
  while (state.screen === 'playing' || state.screen === 'sequence-transition') {
    if (!state.roundResults.some((result) => result.round === state.currentRoundIndex + 1)) {
      const round = state.runManifest.rounds[state.currentRoundIndex]
      if (round.type === 'transcription') {
        state = [...round.answer].reduce((current, base) => gameReducer(current, { type: 'APPEND_BASE', base }), state)
        state = gameReducer(state, { type: 'CHECK_BASE_ROUND' })
      } else if (round.type === 'translation') {
        for (let index = 0; index < round.answers.length; index += 1) {
          state = gameReducer(state, { type: 'SELECT_TRANSLATION', index, value: round.answers[index] })
          state = gameReducer(state, { type: 'CHECK_TRANSLATION_CODON' })
        }
      } else {
        state = gameReducer(state, { type: 'SELECT_FUNCTION_ROW', rowId: round.correctRowId })
        state = gameReducer(state, { type: 'CHECK_FUNCTION_ROW' })
      }
    }
    state = gameReducer(state, { type: 'CONTINUE_AFTER_SUCCESS', now: 20_000 + state.currentRoundIndex * 1_000 })
  }
  return buildFinalPayload(state)
}

function jsonResponse(body: Record<string, unknown>, status: number): Response {
  return new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json' }, status })
}
