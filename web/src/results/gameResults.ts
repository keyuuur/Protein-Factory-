import { gameName, gameVersion } from '../game/content/rounds'
import type {
  FinalGamePayload,
  FunctionReferenceRow,
  GameRound,
  GameSessionState,
  MissedSkill,
  MisconceptionCategory,
  ProductionAction,
  ProductionRating,
  ProteinRound,
  ReplayChallenge,
  RoundResult,
  RoundState,
} from '../types'

export function getExpectedAnswer(round: GameRound): string {
  if (round.type === 'transcription') return round.answer
  if (round.type === 'translation') return round.answers.join('-')
  return round.correctRowId
}

export function getCorrectFunctionRow(round: ProteinRound): FunctionReferenceRow | undefined {
  return round.referenceRows.find((row) => row.id === round.correctRowId)
}

export function getRoundResult(
  round: GameRound,
  roundIndex: number,
  state: RoundState,
  submitted: string,
  correct: boolean,
): RoundResult {
  const independenceAffectingSupport = state.supportEvents.filter((event) => event.affectsIndependence)
  const supportLevel = Math.min(
    3,
    Math.max(state.hintUsed ? 3 : 0, state.mistakes >= 2 ? 2 : state.mistakes),
  ) as 0 | 1 | 2 | 3
  return {
    attempts: state.attempts,
    chain: round.type === 'transcription' ? undefined : round.context.sequence.aminoAcidChain.join('-'),
    correct,
    expected: getExpectedAnswer(round),
    expectedFunctionRowId: round.type === 'protein' ? round.correctRowId : undefined,
    familyId: round.context.familyId,
    firstTryCorrect: correct && state.mistakes === 0 && !state.hintUsed,
    hintUsed: state.hintUsed,
    id: round.id,
    independent: correct && state.mistakes === 0 && independenceAffectingSupport.length === 0,
    mistakes: state.mistakes,
    prompt: round.prompt,
    repairs: state.mistakes,
    round: roundIndex + 1,
    selectedFunctionRowId: round.type === 'protein' ? state.selectedFunctionRowId : undefined,
    sequence: round.context.sequence,
    sequenceEffect: round.context.sequenceEffect,
    sequenceId: round.context.sequenceId,
    sequenceIndex: round.context.sequenceIndex,
    sequenceRole: round.context.sequenceRole,
    stage: round.context.action,
    submitted,
    supportEvents: state.supportEvents,
    supportLevel,
    title: round.title,
    type: round.type,
  }
}

export function upsertRoundResult(results: RoundResult[], result: RoundResult): RoundResult[] {
  const index = results.findIndex((item) => item.round === result.round)
  if (index === -1) return [...results, result]
  const next = [...results]
  next[index] = result
  return next
}

export function selectScore(results: RoundResult[]): number {
  return results.filter((result) => result.correct).length
}

export function getCompletionPercent(score: number, total: number): number {
  return total > 0 ? Math.round((score / total) * 1000) / 10 : 0
}

export function createMissedSkill(
  round: GameRound,
  roundIndex: number,
  state: RoundState,
  submitted: string,
  reason: MissedSkill['reason'],
  category: MisconceptionCategory,
): MissedSkill {
  return {
    attempts: state.attempts,
    category,
    expected: getExpectedAnswer(round),
    reason,
    round: roundIndex + 1,
    roundId: round.id,
    skillId: `${round.id}-${category}-${reason}`,
    submitted: submitted || 'Not answered',
    title: round.title,
    type: round.type,
  }
}

export function summarizeMissedSkills(state: GameSessionState): MissedSkill[] {
  const misses = [...state.missedSkills]
  state.runManifest.rounds.forEach((round, index) => {
    const result = state.roundResults.find((item) => item.round === index + 1)
    if (!result?.correct) {
      misses.push(createMissedSkill(round, index, createEmptyEvidence(), result?.submitted ?? '', 'incomplete', 'incomplete'))
    } else if (result.hintUsed) {
      misses.push(createMissedSkill(
        round,
        index,
        { ...createEmptyEvidence(), attempts: result.attempts },
        result.submitted,
        'hint',
        'hint-support',
      ))
    }
  })
  const seen = new Set<string>()
  return misses.filter((skill) => {
    const key = `${skill.roundId}:${skill.category}:${skill.reason}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

export function formatMissedSkill(skill: MissedSkill): string {
  const status = skill.reason === 'mistake' ? 'needed a repair' : skill.reason === 'hint' ? 'used a hint' : 'was incomplete'
  return `${skill.title} ${status}. Expected ${skill.expected}; recorded ${skill.submitted}.`
}

export function formatMissedRound(round: GameRound, result: RoundResult | undefined): string {
  return `${round.title}: expected ${getExpectedAnswer(round)}; recorded ${result?.submitted || 'Not answered'}.`
}

export function buildFinalPayload(state: GameSessionState): FinalGamePayload {
  const total = 9 as const
  const score = selectScore(state.roundResults)
  const independentStages = state.roundResults.filter((result) => result.independent).length
  const completionPercent = getCompletionPercent(score, total)
  const independencePercent = getCompletionPercent(independentStages, total)
  const repairs = state.roundResults.reduce((sum, result) => sum + result.repairs, 0)
  const supportedRounds = state.roundResults.filter((result) => result.correct && !result.independent).length
  const completedAt = state.completedAt ?? Date.now()
  const missedSkills = summarizeMissedSkills(state)
  const productionRating = getProductionRating(score === total, independentStages, repairs)
  return {
    activeReplayChallenge: state.replayChallenge?.label ?? '',
    attemptId: state.attemptId,
    attemptKind: state.attemptKind,
    attempts: state.roundResults.reduce((sum, result) => sum + result.attempts, 0),
    classPeriod: state.identity.period,
    cleanRounds: independentStages,
    completedProducts: state.completedProducts,
    completionPercent,
    completionStatus: score === total ? 'Completed' : 'Incomplete',
    currentRound: Math.min(state.currentRoundIndex + 1, total),
    factoryRating: productionRating,
    game: gameName,
    gameVersion,
    independentStages,
    independencePercent,
    isDemo: state.identity.isDemo,
    maxScore: total,
    missedSkills,
    mistakes: repairs,
    parentAttemptId: state.parentAttemptId,
    percent: completionPercent,
    productionRating,
    recoveredConcepts: state.recoveredConcepts,
    repairs,
    replayChallengeMet: state.transferResults.some((result) => result.recovered) || isReplayChallengeMet(state.replayChallenge, state.roundResults),
    replayGoal: getReplayGoal(productionRating, missedSkills),
    reviewSummary: buildReviewSummary(missedSkills, state.recoveredConcepts),
    roundResults: state.roundResults,
    roundsCompleted: score,
    runManifest: state.runManifest,
    schemaVersion: 'protein-factory-v4',
    score,
    stageResults: state.roundResults,
    studentName: state.identity.firstName,
    submitType: 'Final Submit',
    supportedRounds,
    timeSpent: state.elapsedSeconds,
    timestamp: new Date(completedAt).toISOString(),
    totalRounds: total,
    transferResults: state.transferResults,
  }
}

export function buildTeacherSummary(payload: FinalGamePayload): string {
  if (payload.attemptKind === 'targeted-practice') {
    const result = payload.transferResults[0]
    return [
      `${payload.studentName} | Period ${payload.classPeriod}`,
      'Targeted practice (new evidence; the original factory run was not repeated)',
      `New skill: ${result?.skillLabel ?? 'Targeted skill unavailable'}`,
      `New evidence: ${result?.evidence ?? 'No targeted-practice evidence recorded'}`,
      `Result: ${result?.outcome === 'recovered' ? 'Recovered' : 'Not yet recovered'}`,
      `Practice attempts: ${result?.attempts ?? 0}/2`,
      `Baseline only - original 9-stage run: ${payload.score}/9 complete; ${payload.independentStages}/9 independent; ${payload.repairs} repairs`,
      `Baseline products preserved: ${payload.completedProducts.length}/3`,
      `Targeted attempt: ${payload.attemptId}`,
      `Original attempt: ${payload.parentAttemptId ?? 'Unavailable'}`,
    ].join('\n')
  }

  return [
    `${payload.studentName} | Period ${payload.classPeriod}`,
    `${payload.game}: ${payload.productionRating} Production`,
    `${payload.completionPercent}% complete; ${payload.independencePercent}% independent; ${payload.repairs} repairs`,
    'Outcomes use the fictional fur-color practice model; they are modeled results, not real fur-color mechanisms.',
    `Sequence effects: ${payload.runManifest.effects.join(' and ')}`,
    `Products completed: ${payload.completedProducts.length}/3`,
    `Review: ${payload.reviewSummary.join('; ') || 'No review targets recorded.'}`,
    `Attempt: ${payload.attemptId}`,
    ...(payload.parentAttemptId ? [`Practice linked to: ${payload.parentAttemptId}`] : []),
  ].join('\n')
}

function getProductionRating(complete: boolean, independent: number, repairs: number): ProductionRating {
  if (!complete || independent < 5) return 'Recalibration'
  if (independent === 9) return 'Precision'
  if (independent >= 7 && repairs <= 2) return 'Stable'
  return 'Supported'
}

function getReplayGoal(rating: ProductionRating, misses: MissedSkill[]): string {
  const target = misses.find((item) => item.reason !== 'incomplete')
  if (rating === 'Precision') return 'Run a different sequence family and keep all nine actions independent.'
  if (target) return `Use a different family to clear ${target.title} without support.`
  return 'Complete all nine production actions with fewer repairs.'
}

function buildReviewSummary(misses: MissedSkill[], recovered: MisconceptionCategory[]): string[] {
  const categories = [...new Set(misses.map((item) => item.category))]
  return categories.map((category) => `${formatCategory(category)}${recovered.includes(category) ? ' (recovered on transfer)' : ''}`)
}

function formatCategory(category: MisconceptionCategory): string {
  const labels: Record<MisconceptionCategory, string> = {
    'codon-grouping': 'Codon grouping',
    'codon-lookup': 'Codon wheel use',
    'hint-support': 'Explicit hint use',
    incomplete: 'Incomplete production',
    'protein-trait-model': 'Protein function model',
    'rna-template-pairing': 'DNA-to-mRNA pairing',
    'rna-uses-u': 'RNA uses U instead of T',
    'stop-signal': 'Stop signal',
  }
  return labels[category]
}

function isReplayChallengeMet(challenge: ReplayChallenge | null, results: RoundResult[]): boolean {
  if (!challenge) return false
  if (challenge.type === 'perfect-run') return results.length === 9 && results.every((result) => result.independent)
  const stage = stageFromRoundId(challenge.roundId)
  const comparable = stage ? results.find((result) => result.stage === stage) : undefined
  if (!comparable) return false
  return challenge.type === 'no-hint-round' ? !comparable.hintUsed : comparable.mistakes < challenge.baselineMistakes
}

function stageFromRoundId(roundId: string | undefined): ProductionAction | undefined {
  if (roundId?.endsWith('-transcription')) return 'transcription'
  if (roundId?.endsWith('-translation')) return 'translation'
  if (roundId?.endsWith('-function')) return 'function-test'
  return undefined
}

function createEmptyEvidence(): RoundState {
  return {
    answers: [],
    attempts: 0,
    currentCodonIndex: 0,
    hintUsed: false,
    input: '',
    mistakes: 0,
    narrowedChoices: [],
    pendingTranslationChoice: '',
    repairTarget: null,
    selectedFunctionRowId: '',
    showHint: false,
    supportEvents: [],
  }
}
