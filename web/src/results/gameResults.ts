import { gameName, gameVersion } from '../game/content/rounds'
import type {
  FinalGamePayload,
  GameRound,
  GameSessionState,
  MissedSkill,
  MisconceptionCategory,
  ProductionRating,
  ProteinRound,
  ReplayChallenge,
  RoundResult,
  RoundState,
} from '../types'

export function getExpectedAnswer(round: GameRound): string {
  if (round.type === 'dna' || round.type === 'transcription') return round.answer
  if (round.type === 'translation') return round.answers.join('-')
  return 'correctTrait' in round ? round.correctTrait : ''
}

export function getCorrectProtein(round: ProteinRound): string {
  return round.options.find((option) => option.trait === round.correctTrait)?.protein ?? ''
}

export function getRoundResult(
  round: GameRound,
  roundIndex: number,
  state: RoundState,
  submitted: string,
  correct: boolean,
  selectedProtein = '',
  selectedTrait = '',
): RoundResult {
  const independenceAffectingSupport = state.supportEvents.filter((event) => event.affectsIndependence)
  const supportLevel = Math.min(3, Math.max(state.hintUsed ? 3 : 0, state.mistakes >= 2 ? 2 : state.mistakes)) as 0 | 1 | 2 | 3
  return {
    attempts: state.attempts,
    chain: round.type === 'protein' ? round.chain : round.type === 'translation' ? round.context.sequence.proteinChain.join('-') : '',
    correct,
    effect: round.context.effect,
    expected: getExpectedAnswer(round),
    expectedProtein: round.type === 'protein' ? getCorrectProtein(round) : '',
    expectedTrait: round.type === 'protein' ? round.correctTrait : '',
    firstTryCorrect: correct && state.mistakes === 0 && !state.hintUsed,
    hintUsed: state.hintUsed,
    id: round.id,
    independent: correct && state.mistakes === 0 && independenceAffectingSupport.length === 0,
    mistakes: state.mistakes,
    orderId: round.context.orderId,
    orderRole: round.context.orderRole,
    pairId: round.context.pairId,
    prompt: round.prompt,
    repairs: state.mistakes,
    round: roundIndex + 1,
    selectedProtein,
    selectedTrait,
    sequence: round.context.sequence,
    stage: round.context.stage,
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
      misses.push(createMissedSkill(round, index, { ...createEmptyEvidence(), attempts: result.attempts }, result.submitted, 'hint', 'hint-support'))
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
  const total = state.runManifest.rounds.length
  const score = selectScore(state.roundResults)
  const independentStages = state.roundResults.filter((result) => result.independent).length
  const repairs = state.roundResults.reduce((sum, result) => sum + result.repairs, 0)
  const supportedRounds = state.roundResults.filter((result) => result.correct && !result.independent).length
  const completedAt = state.completedAt ?? Date.now()
  const missedSkills = summarizeMissedSkills(state)
  const productionRating = getProductionRating(score === total, independentStages, repairs)
  return {
    activeReplayChallenge: state.replayChallenge?.label ?? '',
    attemptId: state.attemptId,
    attempts: state.roundResults.reduce((sum, result) => sum + result.attempts, 0),
    classPeriod: state.identity.period,
    cleanRounds: independentStages,
    completionStatus: score === total ? 'Completed' : 'Incomplete',
    currentRound: Math.min(state.currentRoundIndex + 1, total),
    factoryRating: productionRating,
    game: gameName,
    gameVersion,
    independentStages,
    isDemo: state.identity.isDemo,
    maxScore: total,
    missedSkills,
    mistakes: repairs,
    percent: getCompletionPercent(score, total),
    productionRating,
    recoveredConcepts: state.recoveredConcepts,
    repairs,
    replayChallengeMet: isReplayChallengeMet(state.replayChallenge, state.roundResults),
    replayGoal: getReplayGoal(productionRating, missedSkills),
    reviewSummary: buildReviewSummary(missedSkills, state.recoveredConcepts),
    roundResults: state.roundResults,
    roundsCompleted: score,
    runManifest: state.runManifest,
    schemaVersion: 'protein-factory-attempt-v3',
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
  return [
    `${payload.studentName} | Period ${payload.classPeriod}`,
    `${payload.game}: ${payload.productionRating} Production`,
    `${payload.independentStages}/${payload.totalRounds} independent stages; ${payload.repairs} repairs`,
    `Variant effect: ${payload.runManifest.effect}`,
    `Transfer recovery: ${payload.transferResults.filter((result) => result.recovered).length}/${payload.transferResults.length}`,
    `Review: ${payload.reviewSummary.join('; ') || 'No review targets recorded.'}`,
    `Attempt: ${payload.attemptId}`,
  ].join('\n')
}

function getProductionRating(complete: boolean, independent: number, repairs: number): ProductionRating {
  if (!complete || independent < 4) return 'Recalibration'
  if (independent === 8) return 'Precision'
  if (independent >= 6 && repairs <= 2) return 'Stable'
  return 'Supported'
}

function getReplayGoal(rating: ProductionRating, misses: MissedSkill[]): string {
  const target = misses.find((item) => item.reason !== 'incomplete')
  if (rating === 'Precision') return 'Run a new one-base variant and keep all eight stages independent.'
  if (target) return `Use a new order to clear ${target.title} without support.`
  return 'Complete all eight production stages with fewer repairs.'
}

function buildReviewSummary(misses: MissedSkill[], recovered: MisconceptionCategory[]): string[] {
  const categories = [...new Set(misses.map((item) => item.category))]
  return categories.map((category) => `${formatCategory(category)}${recovered.includes(category) ? ' (recovered on transfer)' : ''}`)
}

function formatCategory(category: MisconceptionCategory): string {
  const labels: Record<MisconceptionCategory, string> = {
    'codon-grouping': 'Codon grouping',
    'codon-lookup': 'Codon chart use',
    'dna-base-pairing': 'DNA base pairing',
    'hint-support': 'Explicit hint use',
    incomplete: 'Incomplete production',
    'protein-trait-model': 'Protein function model',
    'rna-template-pairing': 'mRNA template pairing',
    'rna-uses-u': 'RNA uses U instead of T',
  }
  return labels[category]
}

function isReplayChallengeMet(challenge: ReplayChallenge | null, results: RoundResult[]): boolean {
  if (!challenge) return false
  if (challenge.type === 'perfect-run') return results.length === 8 && results.every((result) => result.independent)
  const comparable = results.find((result) => result.stage === results.find((item) => item.id === challenge.roundId)?.stage)
  if (!comparable) return false
  return challenge.type === 'no-hint-round' ? !comparable.hintUsed : comparable.mistakes < challenge.baselineMistakes
}

function createEmptyEvidence(): RoundState {
  return {
    answers: [], attempts: 0, currentCodonIndex: 0, hintUsed: false, input: '', mistakes: 0,
    narrowedChoices: [], repairTarget: null, selectedProtein: '', selectedTrait: '', showHint: false, supportEvents: [],
  }
}
