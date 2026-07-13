import { describe, expect, it } from 'vitest'
import { createInitialGameState, gameReducer } from '../../src/game/simulation/gameReducer'
import { toProteinFactoryAttemptV4, type ProteinFactoryAttemptV3 } from '../../src/results/appsScriptMapper'
import { buildFinalPayload } from '../../src/results/gameResults'
import {
  MemoryResultRepository,
  type PersistedSubmissionItem,
  type RecoverySnapshot,
} from '../../src/results/resultRepository'
import { SubmissionCoordinator } from '../../src/results/submissionCoordinator'
import type { GameSessionState } from '../../src/types'

describe('recovery import validation and atomicity', () => {
  it('rejects every malformed record before repository replacement', async () => {
    const fixture = recoveryFixture()
    const invalidFiles = [
      mutate(fixture, (value) => { value.queue[0].nextRetryAt = 'tomorrow' }),
      mutate(fixture, (value) => { value.queue[0].attempt.runManifest.sequenceIds[0] = 'tampered-sequence' }),
      mutate(fixture, (value) => { value.results[0].runManifest.rounds[0].context.sequence.mrnaCodons = ['AUG'] }),
      mutate(fixture, (value) => {
        if (!value.checkpoint) throw new Error('Expected checkpoint fixture')
        value.checkpoint.state.screen = 'end'
      }),
      mutate(fixture, (value) => { value.queue.push(structuredClone(value.queue[0])) }),
    ]

    for (const invalid of invalidFiles) {
      const repository = new TrackingMemoryRepository()
      const coordinator = new SubmissionCoordinator({ isOnline: () => false, repository })

      await expect(coordinator.importRecoveryJson(JSON.stringify(invalid))).rejects.toThrow(
        'This is not a Protein Factory recovery file.',
      )
      expect(repository.replaceCalls).toBe(0)
      expect(await repository.getQueue()).toEqual([])
      expect(await repository.getResults()).toEqual([])
      expect(await repository.getCheckpoint()).toBeNull()
    }
  })

  it('restores the prior snapshot if a repository reports failure after replacement', async () => {
    const existing = recoveryFixture('existing-attempt')
    const imported = recoveryFixture('imported-attempt')
    const repository = new FailAfterFirstReplaceRepository()
    await repository.putQueue(existing.queue)
    await repository.putResult(existing.results[0])
    await repository.putCheckpoint(existing.checkpoint!)
    const coordinator = new SubmissionCoordinator({ isOnline: () => false, repository })

    await expect(coordinator.importRecoveryJson(JSON.stringify(imported))).rejects.toThrow('Injected replacement failure')

    expect(repository.replaceCalls).toBe(2)
    expect((await repository.getQueue()).map((item) => item.attemptId)).toEqual(['existing-attempt'])
    expect((await repository.getResults()).map((item) => item.attemptId)).toEqual(['existing-attempt'])
    expect((await repository.getCheckpoint())?.state.attemptId).toBe('existing-attempt')
  })

  it('preserves valid V3 queue attempts alongside V4 results', async () => {
    const fixture = recoveryFixture()
    fixture.queue.push(queueItem(v3Attempt('legacy-v3-attempt')))
    const repository = new MemoryResultRepository()
    const coordinator = new SubmissionCoordinator({ isOnline: () => false, repository })

    await coordinator.importRecoveryJson(JSON.stringify(fixture))

    expect((await repository.getQueue()).map((item) => item.attempt.schemaVersion).sort()).toEqual([
      'protein-factory-attempt-v3',
      'protein-factory-v4',
    ])
    expect((await repository.getResults())[0].schemaVersion).toBe('protein-factory-v4')
  })
})

class TrackingMemoryRepository extends MemoryResultRepository {
  replaceCalls = 0

  override async replaceRecoverySnapshot(snapshot: RecoverySnapshot): Promise<void> {
    this.replaceCalls += 1
    await super.replaceRecoverySnapshot(snapshot)
  }
}

class FailAfterFirstReplaceRepository extends TrackingMemoryRepository {
  override async replaceRecoverySnapshot(snapshot: RecoverySnapshot): Promise<void> {
    await super.replaceRecoverySnapshot(snapshot)
    if (this.replaceCalls === 1) throw new Error('Injected replacement failure')
  }
}

function recoveryFixture(attemptId = 'recovery-v4-attempt') {
  const state = startRun(attemptId)
  const result = buildFinalPayload(state)
  const timestamp = '2026-07-13T18:00:00.000Z'
  return {
    checkpoint: {
      savedAt: timestamp,
      schemaVersion: 'protein-factory-checkpoint-v4' as const,
      state,
    },
    exportedAt: timestamp,
    queue: [queueItem(toProteinFactoryAttemptV4(result), timestamp)],
    results: [result],
    schemaVersion: 'protein-factory-recovery-v1' as const,
  }
}

function queueItem(attempt: ReturnType<typeof toProteinFactoryAttemptV4> | ProteinFactoryAttemptV3, timestamp = '2026-07-13T18:00:00.000Z'): PersistedSubmissionItem {
  return {
    attempt,
    attemptId: attempt.attemptId,
    createdAt: timestamp,
    durability: 'local-storage',
    nextRetryAt: '2026-07-13T18:05:00.000Z',
    retryCount: 1,
    status: 'retry-scheduled',
    updatedAt: timestamp,
  }
}

function startRun(attemptId: string): GameSessionState {
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

function v3Attempt(attemptId: string): ProteinFactoryAttemptV3 {
  return {
    attemptId,
    classPeriod: '2',
    contentVersion: 'protein-factory-v3',
    durationSeconds: 30,
    independentCount: 0,
    isDemo: false,
    maxScore: 8,
    misconceptions: [],
    orderPair: { orderIds: ['order-a', 'order-b'], pairId: 'pair-a' },
    productionRating: 'Recalibration',
    repairs: 0,
    schemaVersion: 'protein-factory-attempt-v3',
    score: 0,
    seed: 'legacy-seed',
    stageResults: [],
    studentName: 'Ada',
    submittedAt: '2026-07-13T18:00:00.000Z',
    supportCount: 0,
    transferResults: [],
    variantEffect: 'no-change',
  }
}

function mutate<T>(value: T, mutation: (copy: T) => void): T {
  const copy = structuredClone(value)
  mutation(copy)
  return copy
}
