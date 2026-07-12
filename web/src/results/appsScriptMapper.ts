import type { AppsScriptAttemptPayload, FinalGamePayload } from '../types'

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
