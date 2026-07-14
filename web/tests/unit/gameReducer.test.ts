import { describe, expect, it } from 'vitest'
import {
  createInitialGameState,
  formatChain,
  gameReducer,
  normalizeResumedGameState,
  selectCurrentVariantComparisonConsequences,
  selectVariantComparisonConsequences,
  selectVariantFocus,
} from '../../src/game/simulation/gameReducer'
import { buildFinalPayload, buildTeacherSummary, selectScore } from '../../src/results/gameResults'
import type { GameSessionState, RoundResult, TeacherSettings } from '../../src/types'

const settings: TeacherSettings = { replayMode: 'full', soundEnabled: false, supportMode: 'standard' }

describe('gameReducer V4 production flow', () => {
  it('completes all nine actions with a transition and product snapshot after each sequence', () => {
    let state = startRun('Kai')
    const expectedStages = [
      'transcription', 'translation', 'function-test',
      'transcription', 'translation', 'function-test',
      'transcription', 'translation', 'function-test',
    ]

    state.runManifest.rounds.forEach((round, index) => {
      expect(round.context.action).toBe(expectedStages[index])
      expect(round.context.sequenceIndex).toBe(Math.floor(index / 3))
      state = completeCurrentAction(state)
      expect(state.roundResults).toHaveLength(index + 1)
      expect(state.feedback?.kind).toBe('success')
      if ((index + 1) % 3 === 0) {
        expect(state.screen).toBe('sequence-transition')
        expect(state.completedProducts).toHaveLength((index + 1) / 3)
      } else {
        expect(state.screen).toBe('playing')
      }
      state = gameReducer(state, { type: 'CONTINUE_AFTER_SUCCESS', now: 2_000 + index * 1_000 })
    })

    expect(state.screen).toBe('end')
    expect(selectScore(state.roundResults)).toBe(9)
    expect(state.roundResults.map((result) => result.stage)).toEqual(expectedStages)
    expect(state.roundResults.every((result) => result.independent)).toBe(true)
    expect(state.completedProducts).toHaveLength(3)

    const payload = buildFinalPayload(state)
    expect(payload.schemaVersion).toBe('protein-factory-v4')
    expect(payload.score).toBe(9)
    expect(payload.maxScore).toBe(9)
    expect(payload.totalRounds).toBe(9)
    expect(payload.percent).toBe(100)
    expect(payload.completionPercent).toBe(100)
    expect(payload.independencePercent).toBe(100)
    expect(payload.productionRating).toBe('Precision')
    expect(payload.completedProducts).toEqual(state.completedProducts)
  })

  it('commits translation select-then-check and treats terminal Stop as a signal, not a chain slot', () => {
    let state = startRun('Maya')
    state = completeAndContinue(state)
    const round = state.runManifest.rounds[state.currentRoundIndex]
    expect(round.type).toBe('translation')
    if (round.type !== 'translation') return

    round.answers.forEach((answer, index) => {
      const before = state.roundState.answers[index]
      if (answer === 'Stop') {
        const wrong = round.codonChoices[index].find((choice) => choice !== answer)!
        state = gameReducer(state, { type: 'SELECT_TRANSLATION', index, value: wrong })
        state = gameReducer(state, { type: 'CHECK_TRANSLATION_CODON' })
        expect(state.roundState.answers[index]).toBe('')
        expect(state.roundState.repairTarget?.category).toBe('stop-signal')
      }
      state = gameReducer(state, { type: 'SELECT_TRANSLATION', index, value: answer })
      expect(before).toBe('')
      expect(state.roundState.answers[index]).toBe('')
      expect(state.roundState.pendingTranslationChoice).toBe(answer)
      state = gameReducer(state, { type: 'CHECK_TRANSLATION_CODON' })
      expect(state.roundState.answers[index]).toBe(answer)
    })

    expect(state.roundState.answers).toEqual(round.answers)
    expect(formatChain(state.roundState)).toBe(round.answers.slice(0, 4).join('-'))
    expect(formatChain(state.roundState)).not.toContain('Stop')
    expect(state.roundResults[0].chain).toBeUndefined()
    expect(state.roundResults[1].chain).toBe(round.context.sequence.aminoAcidChain.join('-'))
  })

  it('prefills variant actions while keeping the focused base and codon as the only editable work', () => {
    let state = startRun('Mina')
    for (let index = 0; index < 3; index += 1) state = completeAndContinue(state)

    const transcription = state.runManifest.rounds[state.currentRoundIndex]
    expect(transcription.type).toBe('transcription')
    if (transcription.type !== 'transcription') return
    const transcriptionFocus = selectVariantFocus(transcription)!
    expect(transcriptionFocus.sequenceIndex).toBe(1)
    expect(state.roundState.input).toHaveLength(transcription.answer.length)
    expect(state.roundState.input[transcriptionFocus.changedMrnaIndex]).toBe(' ')
    expect(removeAt(state.roundState.input, transcriptionFocus.changedMrnaIndex)).toBe(
      removeAt(transcription.answer, transcriptionFocus.changedMrnaIndex),
    )

    state = gameReducer(state, { type: 'APPEND_BASE', base: transcription.answer[transcriptionFocus.changedMrnaIndex] })
    state = gameReducer(state, { type: 'BACKSPACE' })
    expect(state.roundState.input[transcriptionFocus.changedMrnaIndex]).toBe(' ')
    expect(removeAt(state.roundState.input, transcriptionFocus.changedMrnaIndex)).toBe(
      removeAt(transcription.answer, transcriptionFocus.changedMrnaIndex),
    )

    const wrongBase = transcription.options.find((base) => base !== transcription.answer[transcriptionFocus.changedMrnaIndex])!
    state = gameReducer(state, { type: 'APPEND_BASE', base: wrongBase })
    const wrongTranscription = state.roundState.input
    state = gameReducer(state, { type: 'CHECK_BASE_ROUND' })
    expect(state.missedSkills.at(-1)?.submitted).toBe(wrongTranscription)
    expect(state.missedSkills.at(-1)?.submitted).toHaveLength(transcription.answer.length)
    state = gameReducer(state, { type: 'APPEND_BASE', base: transcription.answer[transcriptionFocus.changedMrnaIndex] })
    state = gameReducer(state, { type: 'CHECK_BASE_ROUND' })
    expect(state.roundResults.at(-1)).toMatchObject({
      attempts: 2,
      repairs: 1,
      submitted: transcription.answer,
    })

    state = gameReducer(state, { type: 'CONTINUE_AFTER_SUCCESS', now: 6_000 })
    const translation = state.runManifest.rounds[state.currentRoundIndex]
    expect(translation.type).toBe('translation')
    if (translation.type !== 'translation') return
    const translationFocus = selectVariantFocus(translation)!
    expect(state.roundState.currentCodonIndex).toBe(translationFocus.changedCodonIndex)
    expect(state.roundState.answers).toEqual(
      translation.answers.map((answer, index) => index === translationFocus.changedCodonIndex ? '' : answer),
    )

    const wrongSignal = translation.codonChoices[translationFocus.changedCodonIndex]
      .find((choice) => choice !== translation.answers[translationFocus.changedCodonIndex])!
    state = gameReducer(state, { type: 'SELECT_TRANSLATION', index: translationFocus.changedCodonIndex, value: wrongSignal })
    state = gameReducer(state, { type: 'CHECK_TRANSLATION_CODON' })
    expect(state.missedSkills.at(-1)?.submitted).toBe(
      translation.answers.map((answer, index) => index === translationFocus.changedCodonIndex ? wrongSignal : answer).join('-'),
    )
    state = gameReducer(state, {
      type: 'SELECT_TRANSLATION',
      index: translationFocus.changedCodonIndex,
      value: translation.answers[translationFocus.changedCodonIndex],
    })
    state = gameReducer(state, { type: 'CHECK_TRANSLATION_CODON' })
    expect(state.roundResults.at(-1)).toMatchObject({
      attempts: 2,
      repairs: 1,
      submitted: translation.answers.join('-'),
    })
  })

  it('selects variant focus and comparison consequences without changing catalog content', () => {
    let state = startRun('Sol')
    const manifest = state.runManifest
    const roundIds = manifest.rounds.map((round) => round.id)
    const sameChain = selectVariantComparisonConsequences(manifest, 1)!
    const changedChain = selectVariantComparisonConsequences(manifest, 2)!

    expect(sameChain).toMatchObject({
      aminoAcidChanged: false,
      aminoAcidChainChanged: false,
      codonChanged: true,
      dnaBaseChanged: true,
      effect: 'same-chain',
      expressedTraitChanged: false,
      mrnaBaseChanged: true,
      proteinFunctionChanged: false,
    })
    expect(changedChain).toMatchObject({
      aminoAcidChanged: true,
      aminoAcidChainChanged: true,
      codonChanged: true,
      dnaBaseChanged: true,
      effect: 'amino-acid-change',
      expressedTraitChanged: true,
      mrnaBaseChanged: true,
      proteinFunctionChanged: true,
    })

    for (let index = 0; index < 3; index += 1) state = completeAndContinue(state)
    expect(selectCurrentVariantComparisonConsequences(state)).toEqual(sameChain)
    expect(state.runManifest.rounds.map((round) => round.id)).toEqual(roundIds)
    expect(state.runManifest.schemaVersion).toBe('protein-factory-v4')
  })

  it('normalizes unfinished variant drafts while preserving attempt evidence and completed results', () => {
    let state = startRun('Jo')
    for (let index = 0; index < 3; index += 1) state = completeAndContinue(state)
    const round = state.runManifest.rounds[state.currentRoundIndex]
    if (round.type !== 'transcription') throw new Error('Expected variant transcription round')
    const focus = selectVariantFocus(round)!
    const completedResults = state.roundResults
    const missedSkills = state.missedSkills
    const supportEvents = [{
      action: 'transcription' as const,
      affectsIndependence: true,
      attempt: 2,
      choices: [],
      kind: 'error-location-rule' as const,
      location: 'legacy position',
      rule: 'legacy rule',
    }]
    state = {
      ...state,
      roundState: {
        ...state.roundState,
        attempts: 2,
        hintUsed: true,
        input: `G${round.answer.slice(1, 5)}`,
        mistakes: 1,
        showHint: true,
        supportEvents,
      },
    }

    const normalized = normalizeResumedGameState(state)
    expect(normalized.roundResults).toBe(completedResults)
    expect(normalized.missedSkills).toBe(missedSkills)
    expect(normalized.roundState).toMatchObject({ attempts: 2, hintUsed: true, mistakes: 1, showHint: true })
    expect(normalized.roundState.supportEvents).toBe(supportEvents)
    expect(normalized.roundState.input).toHaveLength(round.answer.length)
    expect(removeAt(normalized.roundState.input, focus.changedMrnaIndex)).toBe(
      removeAt(round.answer, focus.changedMrnaIndex),
    )
  })

  it('records progressive repairs for transcription and function-row checks', () => {
    let state = startRun('Ada')
    const transcription = state.runManifest.rounds[0]
    expect(transcription.type).toBe('transcription')
    if (transcription.type !== 'transcription') return

    const wrongBase = transcription.options.find((base) => base !== transcription.answer[0])!
    state = enterBases(state, `${wrongBase}${transcription.answer.slice(1)}`)
    state = gameReducer(state, { type: 'CHECK_BASE_ROUND' })
    expect(state.roundState.mistakes).toBe(1)
    expect(state.roundState.repairTarget).toMatchObject({ kind: 'base', index: 0, expected: transcription.answer[0] })
    expect(state.roundState.supportEvents[0].kind).toBe('error-location-rule')

    state = gameReducer(state, { type: 'APPEND_BASE', base: transcription.answer[0] })
    state = gameReducer(state, { type: 'CHECK_BASE_ROUND' })
    expect(state.roundResults[0]).toMatchObject({ independent: false, repairs: 1, supportLevel: 1 })

    state = gameReducer(state, { type: 'CONTINUE_AFTER_SUCCESS', now: 3_000 })
    state = completeAndContinue(state)
    const functionRound = state.runManifest.rounds[state.currentRoundIndex]
    expect(functionRound.type).toBe('protein')
    if (functionRound.type !== 'protein') return
    const wrongRowId = functionRound.referenceRows.find((row) => row.id !== functionRound.correctRowId)!.id

    state = gameReducer(state, { type: 'SELECT_FUNCTION_ROW', rowId: wrongRowId })
    state = gameReducer(state, { type: 'CHECK_FUNCTION_ROW' })
    expect(state.roundState.repairTarget?.kind).toBe('function-row')
    state = gameReducer(state, { type: 'SELECT_FUNCTION_ROW', rowId: wrongRowId })
    state = gameReducer(state, { type: 'CHECK_FUNCTION_ROW' })
    expect(state.roundState.mistakes).toBe(2)
    expect(state.roundState.narrowedChoices).toContain(functionRound.correctRowId)
    expect(state.roundState.supportEvents.map((event) => event.kind)).toEqual([
      'error-location-rule',
      'narrowed-choices',
    ])

    state = gameReducer(state, { type: 'SELECT_FUNCTION_ROW', rowId: functionRound.correctRowId })
    state = gameReducer(state, { type: 'CHECK_FUNCTION_ROW' })
    expect(state.screen).toBe('sequence-transition')
    expect(state.roundResults[2]).toMatchObject({ independent: false, repairs: 2, supportLevel: 2 })
  })

  it('keeps the codon wheel independent while explicit hints count as support', () => {
    let state = completeAndContinue(startRun('Nia'))
    state = gameReducer(state, { type: 'OPEN_CODON_WHEEL' })
    state = gameReducer(state, { type: 'OPEN_CODON_WHEEL' })
    expect(state.roundState.supportEvents).toEqual([
      expect.objectContaining({ kind: 'reference-wheel', affectsIndependence: false, action: 'translation' }),
    ])

    state = gameReducer(state, { type: 'TOGGLE_HINT' })
    state = gameReducer(state, { type: 'TOGGLE_HINT' })
    expect(state.roundState.hintUsed).toBe(true)
    expect(state.roundState.supportEvents.filter((event) => event.kind === 'explicit-hint')).toHaveLength(1)
    state = completeCurrentAction(state)
    expect(state.roundResults[1]).toMatchObject({ hintUsed: true, independent: false, supportLevel: 3 })
  })

  it('captures same-chain and changed-chain comparisons from completed products', () => {
    const state = completeRun(startRun('Lena'))
    const [original, sameChain, changedChain] = state.completedProducts

    expect(original.sequenceRole).toBe('original')
    expect(sameChain.sequenceRole).toBe('same-chain-variant')
    expect(changedChain.sequenceRole).toBe('changed-chain-variant')
    expect(countDifferences(original.dnaStrand, sameChain.dnaStrand)).toBe(1)
    expect(sameChain.aminoAcidChain).toEqual(original.aminoAcidChain)
    expect(sameChain.functionRowId).toBe(original.functionRowId)
    expect(countDifferences(original.dnaStrand, changedChain.dnaStrand)).toBe(1)
    expect(countArrayDifferences(original.aminoAcidChain, changedChain.aminoAcidChain)).toBe(1)
    expect(changedChain.functionRowId).not.toBe(original.functionRowId)
  })

  it('uses nine-action thresholds for every production rating', () => {
    const clean = completeRun(startRun('Iris'))
    expect(buildFinalPayload(clean).productionRating).toBe('Precision')
    expect(buildFinalPayload(withSupportedResults(clean, 2)).productionRating).toBe('Stable')
    expect(buildFinalPayload(withSupportedResults(clean, 3)).productionRating).toBe('Supported')
    expect(buildFinalPayload(withSupportedResults(clean, 5)).productionRating).toBe('Recalibration')

    const incomplete = { ...clean, roundResults: clean.roundResults.slice(0, 8) }
    expect(buildFinalPayload(incomplete).productionRating).toBe('Recalibration')

    const supported = buildFinalPayload(withSupportedResults(clean, 3))
    expect(supported.percent).toBe(100)
    expect(supported.completionPercent).toBe(100)
    expect(supported.independencePercent).toBeCloseTo(66.7)
  })

  it('keeps repair practice optional through targeted replay', () => {
    let state = startRun('Omar')
    const first = state.runManifest.rounds[0]
    expect(first.type).toBe('transcription')
    if (first.type !== 'transcription') return
    const wrongBase = first.options.find((base) => base !== first.answer[0])!
    state = enterBases(state, `${wrongBase}${first.answer.slice(1)}`)
    state = gameReducer(state, { type: 'CHECK_BASE_ROUND' })
    state = gameReducer(state, { type: 'APPEND_BASE', base: first.answer[0] })
    state = gameReducer(state, { type: 'CHECK_BASE_ROUND' })
    state = gameReducer(state, { type: 'CONTINUE_AFTER_SUCCESS', now: 2_000 })
    state = completeRemainingRun(state)

    expect(state.screen).toBe('end')
    expect(state.transferTasks).toEqual([])
    expect(state.roundResults[0]).toMatchObject({ independent: false, repairs: 1 })

    const supportedResult = state.roundResults[0]
    const baselineAttemptId = state.attemptId
    const playedFamilyId = state.runManifest.familyId
    const baselineManifest = state.runManifest
    const baselineRoundResults = state.roundResults
    const baselineProducts = state.completedProducts
    state = { ...state, settings: { ...state.settings, replayMode: 'targeted' } }
    state = gameReducer(state, { type: 'REPLAY', now: 20_000 })
    expect(state.screen).toBe('transfer')
    expect(state.attemptId).not.toBe(baselineAttemptId)
    expect(state.attemptKind).toBe('targeted-practice')
    expect(state.parentAttemptId).toBe(baselineAttemptId)
    expect(state.startedAt).toBe(20_000)
    expect(state.completedAt).toBeNull()
    expect(state.elapsedSeconds).toBe(0)
    expect(state.saveStatus).toBe('local-draft')
    expect(state.roundResults).toHaveLength(9)
    expect(state.transferTasks).toHaveLength(1)
    expect(state.transferTasks[0].sourceFamilyId).not.toBe(playedFamilyId)
    expect(state.runManifest).toBe(baselineManifest)
    expect(state.roundResults).toBe(baselineRoundResults)
    expect(state.completedProducts).toBe(baselineProducts)

    const task = state.transferTasks[0]
    const wrongAnswer = task.options.find((option) => option !== task.expected)!
    state = gameReducer(state, { type: 'SUBMIT_TRANSFER', answer: wrongAnswer, now: 20_500 })
    expect(state.screen).toBe('transfer')
    expect(state.transferResults).toEqual([])
    expect(state.transferTasks[0]).toMatchObject({ attempts: 1, submittedAnswers: [wrongAnswer] })
    expect(state.feedback).toMatchObject({ kind: 'error', message: task.correctiveFeedback })

    state = gameReducer(state, { type: 'SUBMIT_TRANSFER', answer: task.expected, now: 21_000 })
    expect(state.screen).toBe('end')
    expect(state.transferResults).toEqual([expect.objectContaining({
      attempts: 2,
      correctiveFeedbackShown: true,
      outcome: 'recovered',
      recovered: true,
      submittedAnswers: [wrongAnswer, task.expected],
      taskId: task.id,
    })])
    expect(state.completedAt).toBe(21_000)
    expect(state.elapsedSeconds).toBe(1)
    expect(buildFinalPayload(state)).toMatchObject({
      attemptKind: 'targeted-practice',
      parentAttemptId: baselineAttemptId,
      completionPercent: 100,
    })
    expect(supportedResult).toMatchObject({ independent: false, repairs: 1 })
    expect(state.runManifest).toBe(baselineManifest)
    expect(state.roundResults).toBe(baselineRoundResults)
    expect(state.completedProducts).toBe(baselineProducts)
    expect(buildTeacherSummary(buildFinalPayload(state))).toContain('Baseline only - original 9-stage run')
    const afterDuplicate = gameReducer(state, { type: 'SUBMIT_TRANSFER', answer: task.expected, now: 22_000 })
    expect(afterDuplicate).toBe(state)
  })

  it('ends targeted practice after a second miss with an explicit not-yet-recovered result', () => {
    let state = targetedReplayForStage(1, 30_000)
    const task = state.transferTasks[0]
    const wrongAnswers = task.options.filter((option) => option !== task.expected)

    state = gameReducer(state, { type: 'SUBMIT_TRANSFER', answer: wrongAnswers[0], now: 30_500 })
    expect(state.screen).toBe('transfer')
    state = gameReducer(state, { type: 'SUBMIT_TRANSFER', answer: wrongAnswers[1] ?? wrongAnswers[0], now: 31_000 })

    expect(state.screen).toBe('end')
    expect(state.recoveredConcepts).not.toContain(task.targetCategory)
    expect(state.transferResults[0]).toMatchObject({
      attempts: 2,
      correctiveFeedbackShown: true,
      outcome: 'not-yet-recovered',
      recovered: false,
    })
    const summary = buildTeacherSummary(buildFinalPayload(state))
    expect(summary).toContain('Result: Not yet recovered')
    expect(summary).toContain('original factory run was not repeated')
  })

  it('provides stage-specific new evidence for every targeted-practice skill', () => {
    const transcription = targetedReplayForStage(0, 40_000).transferTasks[0]
    expect(transcription.stimulus).toMatchObject({ kind: 'transcription' })
    if (transcription.stimulus.kind === 'transcription') {
      expect(transcription.stimulus.dnaTemplate).toHaveLength(15)
    }

    const translation = targetedReplayForStage(1, 41_000).transferTasks[0]
    expect(translation.stimulus).toMatchObject({ kind: 'translation' })
    if (translation.stimulus.kind === 'translation') {
      expect(translation.stimulus.mrnaCodons).toHaveLength(5)
      expect(translation.expected.split('-')).toHaveLength(5)
    }

    const functionTest = targetedReplayForStage(2, 42_000).transferTasks[0]
    expect(functionTest.stimulus).toMatchObject({ kind: 'function-test' })
    if (functionTest.stimulus.kind === 'function-test') {
      expect(functionTest.stimulus.aminoAcidChain).toHaveLength(4)
      expect(functionTest.stimulus.referenceRows.some((row) => row.id === functionTest.expected)).toBe(true)
    }
  })

  it('replays with a different family and resets identity for the next student', () => {
    const completed = completeRun(startRun('Maya'))
    const attemptId = completed.attemptId
    const familyId = completed.runManifest.familyId
    const replayed = gameReducer(completed, { type: 'REPLAY', now: 30_000 })

    expect(replayed.attemptId).not.toBe(attemptId)
    expect(replayed.runManifest.familyId).not.toBe(familyId)
    expect(replayed.identity.firstName).toBe('Maya')
    expect(replayed.screen).toBe('playing')
    expect(replayed.roundResults).toEqual([])
    expect(replayed.completedProducts).toEqual([])
    expect(gameReducer(replayed, { type: 'REPLAY', now: 30_001 })).toBe(replayed)

    const nextStudent = gameReducer(completed, { type: 'RESTART', now: 40_000 })
    expect(nextStudent.identity.firstName).toBe('')
    expect(nextStudent.identity.period).toBe('3')
    expect(nextStudent.screen).toBe('start')
  })

  it('makes rapid checks and continues idempotent', () => {
    let state = startRun('Rae')
    state = completeCurrentAction(state)
    expect(gameReducer(state, { type: 'CHECK_BASE_ROUND' })).toBe(state)

    state = gameReducer(state, { type: 'CONTINUE_AFTER_SUCCESS', now: 2_000 })
    expect(gameReducer(state, { type: 'CONTINUE_AFTER_SUCCESS', now: 2_001 })).toBe(state)
    const translation = state.runManifest.rounds[state.currentRoundIndex]
    expect(translation.type).toBe('translation')
    if (translation.type !== 'translation') return
    state = gameReducer(state, { type: 'SELECT_TRANSLATION', index: 0, value: translation.answers[0] })
    state = gameReducer(state, { type: 'CHECK_TRANSLATION_CODON' })
    expect(gameReducer(state, { type: 'CHECK_TRANSLATION_CODON' })).toBe(state)
    expect(state.roundState.attempts).toBe(1)

    state = completeCurrentAction(state)
    state = gameReducer(state, { type: 'CONTINUE_AFTER_SUCCESS', now: 3_000 })
    state = completeCurrentAction(state)
    expect(gameReducer(state, { type: 'CHECK_FUNCTION_ROW' })).toBe(state)
    expect(state.roundResults).toHaveLength(3)
    expect(state.completedProducts).toHaveLength(1)
  })
})

function startRun(name: string): GameSessionState {
  let state = createInitialGameState(1_000)
  const rejected = gameReducer(state, {
    type: 'START_GAME', demoMode: false, firstName: '', period: '3', settings, now: 1_000,
  })
  expect(rejected).toBe(state)
  state = gameReducer(state, {
    type: 'START_GAME', demoMode: false, firstName: name, period: '3', settings, now: 1_000,
  })
  expect(state.screen).toBe('tutorial')
  state = gameReducer(state, { type: 'START_ROUNDS' })
  expect(state.screen).toBe('playing')
  return state
}

function completeRun(state: GameSessionState): GameSessionState {
  return completeRemainingRun(state)
}

function targetedReplayForStage(stageIndex: number, now: number): GameSessionState {
  const baseline = completeRun(startRun(`Practice ${stageIndex}`))
  const roundResults = baseline.roundResults.map((result, index): RoundResult => index === stageIndex
    ? { ...result, firstTryCorrect: false, independent: false, mistakes: 1, repairs: 1, supportLevel: 1 }
    : result)
  return gameReducer({
    ...baseline,
    roundResults,
    settings: { ...baseline.settings, replayMode: 'targeted' },
  }, { type: 'REPLAY', now })
}

function completeRemainingRun(state: GameSessionState): GameSessionState {
  let next = state
  while (next.screen === 'playing' || next.screen === 'sequence-transition') {
    if (!next.roundResults.some((result) => result.round === next.currentRoundIndex + 1)) {
      next = completeCurrentAction(next)
    }
    next = gameReducer(next, { type: 'CONTINUE_AFTER_SUCCESS', now: 2_000 + next.currentRoundIndex * 1_000 })
  }
  return next
}

function completeAndContinue(state: GameSessionState): GameSessionState {
  const completed = completeCurrentAction(state)
  return gameReducer(completed, { type: 'CONTINUE_AFTER_SUCCESS', now: 2_000 + state.currentRoundIndex * 1_000 })
}

function completeCurrentAction(state: GameSessionState): GameSessionState {
  const round = state.runManifest.rounds[state.currentRoundIndex]
  let next = state
  if (round.type === 'transcription') {
    const focus = selectVariantFocus(round)
    next = focus
      ? gameReducer(next, { type: 'APPEND_BASE', base: round.answer[focus.changedMrnaIndex] })
      : enterBases(next, round.answer)
    return gameReducer(next, { type: 'CHECK_BASE_ROUND' })
  }
  if (round.type === 'translation') {
    while (!next.roundResults.some((result) => result.round === next.currentRoundIndex + 1)) {
      const index = next.roundState.currentCodonIndex
      next = gameReducer(next, { type: 'SELECT_TRANSLATION', index, value: round.answers[index] })
      next = gameReducer(next, { type: 'CHECK_TRANSLATION_CODON' })
    }
    return next
  }
  next = gameReducer(next, { type: 'SELECT_FUNCTION_ROW', rowId: round.correctRowId })
  return gameReducer(next, { type: 'CHECK_FUNCTION_ROW' })
}

function enterBases(state: GameSessionState, sequence: string): GameSessionState {
  return [...sequence].reduce((next, base) => gameReducer(next, { type: 'APPEND_BASE', base }), state)
}

function withSupportedResults(state: GameSessionState, supportedCount: number): GameSessionState {
  const roundResults = state.roundResults.map((result, index): RoundResult => index < supportedCount
    ? { ...result, firstTryCorrect: false, independent: false, mistakes: 1, repairs: 1, supportLevel: 1 }
    : result)
  return { ...state, roundResults }
}

function countDifferences(left: string, right: string): number {
  return [...left].filter((value, index) => value !== right[index]).length
}

function countArrayDifferences(left: string[], right: string[]): number {
  return left.filter((value, index) => value !== right[index]).length
}

function removeAt(input: string, index: number): string {
  return `${input.slice(0, index)}${input.slice(index + 1)}`
}
