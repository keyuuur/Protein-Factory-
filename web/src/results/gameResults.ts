import { gameVersion, rounds } from '../game/content/rounds'
import type {
  FinalGamePayload,
  GameRound,
  GameSessionState,
  MissedSkill,
  MisconceptionCategory,
  ProteinRound,
  ReplayChallenge,
  RoundResult,
  RoundState,
} from '../types'

export function getExpectedAnswer(round: GameRound): string {
  switch (round.type) {
    case 'dna':
    case 'transcription':
      return round.answer
    case 'translation':
      return round.answers.join('-')
    case 'protein':
      return round.correctTrait
  }
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
  return {
    round: roundIndex + 1,
    id: round.id,
    type: round.type,
    title: round.title,
    prompt: round.prompt,
    correct,
    expected: getExpectedAnswer(round),
    submitted,
    attempts: state.attempts,
    mistakes: state.mistakes,
    firstTryCorrect: correct && state.mistakes === 0 && !state.hintUsed,
    hintUsed: state.hintUsed,
    chain: round.type === 'protein' ? round.chain : round.type === 'translation' ? round.answers.join('-') : '',
    selectedProtein,
    selectedTrait,
    expectedProtein: round.type === 'protein' ? getCorrectProtein(round) : '',
    expectedTrait: round.type === 'protein' ? round.correctTrait : '',
  }
}

export function upsertRoundResult(results: RoundResult[], result: RoundResult): RoundResult[] {
  const existingIndex = results.findIndex((item) => item.round === result.round)

  if (existingIndex === -1) {
    return [...results, result]
  }

  const nextResults = [...results]
  nextResults[existingIndex] = result
  return nextResults
}

export function selectScore(results: RoundResult[]): number {
  return results.filter((result) => result.correct).length
}

export function getCompletionPercent(score: number, totalRounds: number): number {
  return totalRounds > 0 ? Math.round((score / totalRounds) * 1000) / 10 : 0
}

export function createMissedSkill(
  round: GameRound,
  roundIndex: number,
  state: RoundState,
  submitted: string,
  reason: MissedSkill['reason'],
  category: MisconceptionCategory = reason === 'hint' ? 'hint-support' : reason === 'incomplete' ? 'incomplete' : 'dna-base-pairing',
): MissedSkill {
  return {
    round: roundIndex + 1,
    roundId: round.id,
    type: round.type,
    skillId: `${round.type}-${reason}-${roundIndex + 1}`,
    title: round.title,
    expected: getExpectedAnswer(round),
    submitted: submitted || 'Not answered',
    attempts: state.attempts,
    reason,
    category,
  }
}

export function summarizeMissedSkills(state: GameSessionState): MissedSkill[] {
  const misses = [...state.missedSkills]

  rounds.forEach((round, index) => {
    const result = state.roundResults.find((item) => item.round === index + 1)

    if (!result || !result.correct) {
      misses.push({
        round: index + 1,
        roundId: round.id,
        type: round.type,
        skillId: `${round.type}-incomplete-${index + 1}`,
        title: round.title,
        expected: getExpectedAnswer(round),
        submitted: result?.submitted || 'Not answered',
        attempts: result?.attempts ?? 0,
        reason: 'incomplete',
        category: 'incomplete',
      })
    } else if (result.hintUsed) {
      misses.push({
        round: index + 1,
        roundId: round.id,
        type: round.type,
        skillId: `${round.type}-hint-${index + 1}`,
        title: round.title,
        expected: result.expected,
        submitted: result.submitted,
        attempts: result.attempts,
        reason: 'hint',
        category: 'hint-support',
      })
    }
  })

  return dedupeMissedSkills(misses)
}

export function formatMissedSkill(skill: MissedSkill): string {
  const reason =
    skill.reason === 'mistake'
      ? 'needed a correction'
      : skill.reason === 'hint'
        ? 'used a hint'
        : 'was incomplete'
  const reviewRule = getReviewRule(skill.type)

  return `${skill.title}: ${reason}. Review ${reviewRule}. Expected ${skill.expected}; submitted ${skill.submitted}.`
}

export function formatMissedRound(round: GameRound, result: RoundResult | undefined): string {
  const submitted = result?.submitted || 'Not answered'

  if (round.type === 'protein') {
    return `${round.title}: expected ${getCorrectProtein(round)} (${round.correctTrait}); submitted ${submitted}.`
  }

  return `${round.title}: expected ${getExpectedAnswer(round)}; submitted ${submitted}.`
}

export function buildFinalPayload(state: GameSessionState): FinalGamePayload {
  const score = selectScore(state.roundResults)
  const missedSkills = summarizeMissedSkills(state)
  const attempts = state.roundResults.reduce((sum, result) => sum + result.attempts, 0)
  const mistakes = state.roundResults.reduce((sum, result) => sum + result.mistakes, 0)
  const cleanRounds = state.roundResults.filter((result) => result.firstTryCorrect).length
  const supportedRounds = state.roundResults.filter((result) => result.correct && !result.firstTryCorrect).length
  const completedAt = state.completedAt ?? Date.now()
  const factoryRating = getFactoryRating(score, cleanRounds, mistakes, missedSkills.length)
  const replayChallengeMet = isReplayChallengeMet(state.replayChallenge, state.roundResults, missedSkills)

  return {
    schemaVersion: 'web-final-v2',
    attemptId: state.attemptId,
    timestamp: new Date(completedAt).toISOString(),
    game: 'Pirate Protein Factory',
    gameVersion,
    classPeriod: state.identity.period,
    studentName: state.identity.firstName,
    isDemo: state.identity.isDemo,
    score,
    maxScore: rounds.length,
    roundsCompleted: score,
    totalRounds: rounds.length,
    percent: getCompletionPercent(score, rounds.length),
    attempts,
    mistakes,
    cleanRounds,
    supportedRounds,
    factoryRating,
    replayGoal: getReplayGoal(score, mistakes, missedSkills),
    activeReplayChallenge: state.replayChallenge?.label ?? '',
    replayChallengeMet,
    reviewSummary: buildReviewSummary(missedSkills),
    timeSpent: state.elapsedSeconds,
    completionStatus: score === rounds.length ? 'Completed' : 'Incomplete',
    currentRound: Math.min(state.currentRoundIndex + 1, rounds.length),
    submitType: 'Final Submit',
    roundResults: state.roundResults,
    missedSkills,
  }
}

export function buildTeacherSummary(payload: FinalGamePayload): string {
  const reviewTargets =
    payload.reviewSummary.length > 0 ? payload.reviewSummary.join('; ') : 'No corrections or hints recorded.'

  return [
    `${payload.studentName} | Period ${payload.classPeriod}`,
    `${payload.game} ${payload.score}/${payload.maxScore} (${payload.percent}%)`,
    `${payload.factoryRating}: ${payload.cleanRounds} clean, ${payload.supportedRounds} with support, ${payload.mistakes} corrections`,
    `Replay goal: ${payload.replayGoal}`,
    `Review: ${reviewTargets}`,
    `Attempt: ${payload.attemptId}`,
  ].join('\n')
}

function getFactoryRating(score: number, cleanRounds: number, mistakes: number, missedCount: number): string {
  if (score === rounds.length && cleanRounds === rounds.length) {
    return 'Perfect Run'
  }

  if (score === rounds.length && mistakes <= 2 && missedCount <= 2) {
    return 'Steady Run'
  }

  if (score === rounds.length) {
    return 'Repair Run'
  }

  return 'Practice Run'
}

function getReplayGoal(score: number, mistakes: number, missedSkills: MissedSkill[]): string {
  if (score < rounds.length) {
    return 'Replay to finish every factory station.'
  }

  const firstHint = missedSkills.find((skill) => skill.reason === 'hint')
  if (firstHint) {
    return `Replay without a hint on ${firstHint.title}.`
  }

  const firstMistake = missedSkills.find((skill) => skill.reason === 'mistake')
  if (firstMistake || mistakes > 0) {
    return `Replay with fewer corrections on ${firstMistake?.title ?? 'the factory run'}.`
  }

  return 'Replay for a faster perfect run.'
}

function buildReviewSummary(missedSkills: MissedSkill[]): string[] {
  const counts = missedSkills.reduce<Record<MisconceptionCategory, number>>((summary, skill) => {
    summary[skill.category] = (summary[skill.category] ?? 0) + 1
    return summary
  }, {} as Record<MisconceptionCategory, number>)

  return Object.entries(counts).map(([category, count]) => `${formatCategory(category as MisconceptionCategory)}: ${count}`)
}

function formatCategory(category: MisconceptionCategory): string {
  switch (category) {
    case 'dna-base-pairing':
      return 'DNA base pairing'
    case 'rna-template-pairing':
      return 'mRNA template pairing'
    case 'rna-uses-u':
      return 'RNA uses U'
    case 'codon-lookup':
      return 'Codon lookup'
    case 'codon-grouping':
      return 'Codon grouping'
    case 'protein-trait-model':
      return 'Protein-trait model'
    case 'hint-support':
      return 'Hint support'
    case 'incomplete':
      return 'Incomplete work'
  }
}

function isReplayChallengeMet(
  challenge: ReplayChallenge | null,
  results: RoundResult[],
  missedSkills: MissedSkill[],
): boolean {
  if (!challenge) {
    return false
  }

  if (challenge.type === 'perfect-run') {
    return results.length === rounds.length && missedSkills.length === 0
  }

  const targetResult = results.find((result) => result.id === challenge.roundId)
  if (!targetResult?.correct) {
    return false
  }

  if (challenge.type === 'no-hint-round') {
    return !targetResult.hintUsed
  }

  return targetResult.mistakes < challenge.baselineMistakes
}

function getReviewRule(type: MissedSkill['type']): string {
  switch (type) {
    case 'dna':
      return 'DNA base pairing'
    case 'transcription':
      return 'mRNA pairing from template DNA'
    case 'translation':
      return 'mRNA codon translation'
    case 'protein':
      return 'the protein-to-trait model'
  }
}

function dedupeMissedSkills(skills: MissedSkill[]): MissedSkill[] {
  const seen = new Set<string>()
  return skills.filter((skill) => {
    const key = `${skill.roundId}:${skill.reason}:${skill.submitted}`
    if (seen.has(key)) {
      return false
    }
    seen.add(key)
    return true
  })
}
