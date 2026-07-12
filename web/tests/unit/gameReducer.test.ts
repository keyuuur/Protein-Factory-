import { describe, expect, it } from 'vitest'
import { buildRunManifest, proteinOrderPairs, validateContent } from '../../src/game/content/rounds'
import { createInitialGameState, gameReducer } from '../../src/game/simulation/gameReducer'
import { buildFinalPayload, selectScore } from '../../src/results/gameResults'
import { toAppsScriptAttemptPayload, toProteinFactoryAttemptV3 } from '../../src/results/appsScriptMapper'
import type { GameRound, GameSessionState, TeacherSettings } from '../../src/types'

const settings: TeacherSettings = { replayMode: 'full', soundEnabled: false, supportMode: 'standard' }

describe('seeded Protein Factory content', () => {
  it('validates all six order pairs and all three one-base outcomes', () => {
    expect(validateContent()).toEqual([])
    expect(proteinOrderPairs).toHaveLength(6)
    expect(new Set(proteinOrderPairs.map((pair) => pair.effect))).toEqual(new Set(['no-change', 'amino-acid-change', 'early-stop']))
  })

  it('selects the same pair for the same seed and a different pair when excluded', () => {
    const first = buildRunManifest('classroom-seed')
    expect(buildRunManifest('classroom-seed').pairId).toBe(first.pairId)
    expect(buildRunManifest('classroom-seed', [first.pairId]).pairId).not.toBe(first.pairId)
  })
})

describe('gameReducer production flow', () => {
  it('requires identity and records progressive repair support', () => {
    let state = createInitialGameState(1000)
    state = gameReducer(state, { type: 'START_GAME', demoMode: false, firstName: '', period: '2', settings, now: 1000 })
    expect(state.screen).toBe('start')

    state = startRun('Ada')
    const round = state.runManifest.rounds[0]
    expect(round.type).toBe('dna')
    if (round.type !== 'dna') return
    const wrong = `${round.answer[0] === 'A' ? 'T' : 'A'}${round.answer.slice(1)}`
    state = enterBases(state, wrong)
    state = gameReducer(state, { type: 'CHECK_BASE_ROUND' })
    expect(state.roundState.mistakes).toBe(1)
    expect(state.roundState.repairTarget?.index).toBe(0)
    expect(state.roundState.supportEvents[0].kind).toBe('error-location-rule')
    expect(selectScore(state.roundResults)).toBe(0)

    state = gameReducer(state, { type: 'APPEND_BASE', base: round.answer[0] })
    state = gameReducer(state, { type: 'CHECK_BASE_ROUND' })
    expect(state.screen).toBe('success')
    expect(state.roundResults[0].independent).toBe(false)
    expect(state.roundResults[0].repairs).toBe(1)
  })

  it('treats the codon chart as a tool while explicit hints affect independence', () => {
    let state = startRun('Maya')
    state = { ...state, currentRoundIndex: 2, roundState: createRoundStateFor(state.runManifest.rounds[2]), taskDockOpen: true }
    state = gameReducer(state, { type: 'OPEN_CODON_WHEEL' })
    expect(state.roundState.supportEvents[0].kind).toBe('codon-chart')
    expect(state.roundState.supportEvents[0].affectsIndependence).toBe(false)
    state = gameReducer(state, { type: 'TOGGLE_HINT' })
    expect(state.roundState.hintUsed).toBe(true)
    expect(state.roundState.supportEvents.some((event) => event.kind === 'explicit-hint')).toBe(true)
  })

  it('completes two connected orders and assigns Precision Production', () => {
    const state = completeRun(startRun('Kai'))
    const payload = buildFinalPayload(state)
    expect(state.screen).toBe('end')
    expect(payload.game).toBe('Protein Factory')
    expect(payload.schemaVersion).toBe('protein-factory-attempt-v3')
    expect(payload.score).toBe(8)
    expect(payload.independentStages).toBe(8)
    expect(payload.productionRating).toBe('Precision')
    expect(payload.runManifest.rounds.slice(0, 4).every((round) => round.context.orderRole === 'normal')).toBe(true)
    expect(payload.runManifest.rounds.slice(4).every((round) => round.context.orderRole === 'one-base-variant')).toBe(true)
    expect(payload.stageResults).toHaveLength(8)

    const v3 = toProteinFactoryAttemptV3(payload)
    expect(v3.orderPair.pairId).toBe(payload.runManifest.pairId)
    expect(v3.variantEffect).toBe(payload.runManifest.effect)
    const legacy = toAppsScriptAttemptPayload(payload, 'unit-test')
    expect(legacy.isFinalSubmit).toBe(true)
  })

  it('offers unseen transfer tasks after supported stages without rewriting the original result', () => {
    let state = startRun('Nia')
    const first = state.runManifest.rounds[0]
    if (first.type !== 'dna') return
    state = enterBases(state, `${first.answer[0] === 'A' ? 'T' : 'A'}${first.answer.slice(1)}`)
    state = gameReducer(state, { type: 'CHECK_BASE_ROUND' })
    state = gameReducer(state, { type: 'CLEAR_INPUT' })
    state = enterBases(state, first.answer)
    state = gameReducer(state, { type: 'CHECK_BASE_ROUND' })
    state = gameReducer(state, { type: 'CONTINUE_AFTER_SUCCESS', now: 2000 })
    state = completeRemainingRun(state, 1)
    expect(state.screen).toBe('transfer')
    expect(state.transferTasks.length).toBeGreaterThan(0)
    expect(state.transferTasks[0].sourcePairId).not.toBe(state.runManifest.pairId)
    expect(state.roundResults[0].independent).toBe(false)
    const task = state.transferTasks[0]
    state = gameReducer(state, { type: 'SUBMIT_TRANSFER', answer: task.expected, now: 20_000 })
    expect(state.transferResults[0].recovered).toBe(true)
    expect(state.roundResults[0].independent).toBe(false)
  })

  it('creates a new attempt and unseen order on full replay, then clears identity for Next Student', () => {
    let state = completeRun(startRun('Maya'))
    const attemptId = state.attemptId
    const pairId = state.runManifest.pairId
    state = gameReducer(state, { type: 'REPLAY', now: 30_000 })
    expect(state.attemptId).not.toBe(attemptId)
    expect(state.runManifest.pairId).not.toBe(pairId)
    expect(state.identity.firstName).toBe('Maya')
    state = gameReducer(state, { type: 'RESTART', now: 40_000 })
    expect(state.identity.firstName).toBe('')
    expect(state.identity.period).toBe('3')
  })
})

function startRun(name: string): GameSessionState {
  let state = createInitialGameState(1000)
  state = gameReducer(state, { type: 'START_GAME', demoMode: false, firstName: name, period: '3', settings, now: 1000 })
  state = gameReducer(state, { type: 'START_ROUNDS' })
  state = gameReducer(state, { type: 'BEGIN_ROUND' })
  state = gameReducer(state, { type: 'OPEN_ACTIVE_STATION' })
  return state
}

function completeRun(state: GameSessionState): GameSessionState {
  return completeRemainingRun(state, 0)
}

function completeRemainingRun(state: GameSessionState, startIndex: number): GameSessionState {
  let next = state
  for (let index = startIndex; index < next.runManifest.rounds.length; index += 1) {
    const round = next.runManifest.rounds[index]
    if (!next.taskDockOpen) next = gameReducer(next, { type: 'OPEN_ACTIVE_STATION' })
    next = completeRound(next, round)
    next = gameReducer(next, { type: 'CONTINUE_AFTER_SUCCESS', now: 2000 + index * 1000 })
  }
  return next
}

function completeRound(state: GameSessionState, round: GameRound): GameSessionState {
  let next = state
  if (round.type === 'dna' || round.type === 'transcription') {
    next = enterBases(next, round.answer)
    return gameReducer(next, { type: 'CHECK_BASE_ROUND' })
  }
  if (round.type === 'translation') {
    round.answers.forEach((answer, index) => {
      next = gameReducer(next, { type: 'SELECT_TRANSLATION', index, value: answer })
    })
    return gameReducer(next, { type: 'CHECK_FULL_TRANSLATION' })
  }
  const option = round.options.find((item) => item.trait === round.correctTrait)!
  next = gameReducer(next, { type: 'SELECT_PROTEIN', option })
  return gameReducer(next, { type: 'CHECK_PROTEIN' })
}

function enterBases(state: GameSessionState, sequence: string): GameSessionState {
  return [...sequence].reduce((next, base) => gameReducer(next, { type: 'APPEND_BASE', base }), state)
}

function createRoundStateFor(round: GameRound) {
  return {
    answers: round.type === 'translation' ? new Array(round.codons.length).fill('') : [], attempts: 0,
    currentCodonIndex: 0, hintUsed: false, input: '', mistakes: 0, narrowedChoices: [], repairTarget: null,
    selectedProtein: '', selectedTrait: '', showHint: false, supportEvents: [],
  }
}
