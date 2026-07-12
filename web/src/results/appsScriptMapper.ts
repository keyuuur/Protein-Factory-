import type {
  AppsScriptAttemptPayload,
  FinalGamePayload,
  MissedSkill,
  MutationEffect,
  ProductionRating,
  StageResult,
  TransferResult,
} from '../types'

export const proteinFactoryAttemptSchemaVersion = 'protein-factory-attempt-v3' as const

export interface ProteinFactoryAttemptV3 {
  attemptId: string
  classPeriod: string
  contentVersion: string
  durationSeconds: number
  independentCount: number
  isDemo: boolean
  maxScore: number
  misconceptions: MissedSkill[]
  orderPair: {
    orderIds: [string, string]
    pairId: string
  }
  productionRating: ProductionRating
  repairs: number
  schemaVersion: typeof proteinFactoryAttemptSchemaVersion
  score: number
  seed: string | number
  stageResults: StageResult[]
  studentName: string
  submittedAt: string
  supportCount: number
  transferResults: TransferResult[]
  variantEffect: MutationEffect
}

export function toProteinFactoryAttemptV3(payload: FinalGamePayload): ProteinFactoryAttemptV3 {
  return {
    attemptId: payload.attemptId,
    classPeriod: payload.classPeriod,
    contentVersion: payload.gameVersion,
    durationSeconds: payload.timeSpent,
    independentCount: payload.independentStages,
    isDemo: payload.isDemo,
    maxScore: payload.maxScore,
    misconceptions: payload.missedSkills,
    orderPair: {
      orderIds: payload.runManifest.orderIds,
      pairId: payload.runManifest.pairId,
    },
    productionRating: payload.productionRating,
    repairs: payload.repairs,
    schemaVersion: proteinFactoryAttemptSchemaVersion,
    score: payload.score,
    seed: payload.runManifest.seed,
    stageResults: payload.stageResults,
    studentName: payload.studentName,
    submittedAt: payload.timestamp,
    supportCount: payload.supportedRounds,
    transferResults: payload.transferResults,
    variantEffect: payload.runManifest.effect,
  }
}

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
    })),
    roundResults: payload.roundResults,
    userAgent,
    schemaVersion: payload.schemaVersion,
  }
}
