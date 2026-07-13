import type {
  AppsScriptAttemptPayload,
  FinalGamePayload,
  ProductionRating,
  ProteinFactoryAttemptV4,
} from '../types'

export const legacyProteinFactoryAttemptSchemaVersion = 'protein-factory-attempt-v3' as const
export const proteinFactoryAttemptSchemaVersion = 'protein-factory-v4' as const

export interface ProteinFactoryAttemptV3 {
  attemptId: string
  classPeriod: string
  contentVersion: string
  durationSeconds: number
  independentCount: number
  isDemo: boolean
  maxScore: number
  misconceptions: Array<Record<string, unknown>>
  orderPair: {
    orderIds: [string, string]
    pairId: string
  }
  productionRating: ProductionRating
  repairs: number
  schemaVersion: typeof legacyProteinFactoryAttemptSchemaVersion
  score: number
  seed: string | number
  stageResults: Array<Record<string, unknown>>
  studentName: string
  submittedAt: string
  supportCount: number
  transferResults: Array<Record<string, unknown>>
  variantEffect: 'no-change' | 'amino-acid-change' | 'early-stop'
}

export type ProteinFactorySubmissionAttempt = ProteinFactoryAttemptV3 | ProteinFactoryAttemptV4

export function toProteinFactoryAttemptV4(payload: FinalGamePayload): ProteinFactoryAttemptV4 {
  const independentStages = Number(payload.independentStages) || 0
  const completionPercent = payload.completionPercent ?? payload.percent
  const independencePercent = payload.independencePercent ?? Math.round((independentStages / 9) * 1000) / 10
  return {
    ...payload,
    attemptKind: payload.attemptKind ?? 'full-run',
    completedProducts: [...payload.completedProducts],
    completionPercent,
    independencePercent,
    parentAttemptId: payload.parentAttemptId ?? null,
    roundResults: [...payload.roundResults],
    runManifest: {
      ...payload.runManifest,
      effects: [...payload.runManifest.effects],
      rounds: [...payload.runManifest.rounds],
      sequenceIds: [...payload.runManifest.sequenceIds],
    },
    stageResults: [...payload.stageResults],
    transferResults: [...payload.transferResults],
  }
}

// Temporary source-compatibility for App.tsx while its V4 integration lands.
export const toProteinFactoryAttemptV3 = toProteinFactoryAttemptV4

// Kept for the legacy Apps Script UI, which still calls saveAttempt directly.
export function toAppsScriptAttemptPayload(
  payload: FinalGamePayload,
  userAgent = typeof navigator === 'undefined' ? '' : navigator.userAgent,
): AppsScriptAttemptPayload {
  return {
    attemptId: payload.attemptId,
    firstName: payload.studentName,
    period: payload.classPeriod,
    score: payload.score,
    percent: payload.percent,
    completedStatus: payload.completionStatus,
    roundsCompleted: payload.roundsCompleted,
    totalRounds: payload.totalRounds,
    timeSpentSeconds: payload.timeSpent,
    currentRound: payload.currentRound,
    isAutosave: false,
    isFinalSubmit: true,
    responses: payload.roundResults.map((result) => ({
      round: result.round,
      type: result.type,
      submitted: result.submitted,
      expected: result.expected,
      correct: result.correct,
      attempts: result.attempts,
      mistakes: result.mistakes,
      hintUsed: result.hintUsed,
      familyId: result.familyId,
      sequenceId: result.sequenceId,
      sequenceEffect: result.sequenceEffect,
    })),
    roundResults: payload.roundResults,
    userAgent,
    schemaVersion: payload.schemaVersion,
    familyId: payload.runManifest.familyId,
    sequenceIds: [...payload.runManifest.sequenceIds],
    completedProducts: [...payload.completedProducts],
  }
}
