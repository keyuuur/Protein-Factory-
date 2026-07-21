import { describe, expect, it } from 'vitest'
import {
  createInitialGameState,
  gameReducer,
  selectVariantFocus,
} from '../../src/game/simulation/gameReducer'
import { buildFactorySceneState } from '../../src/render/adapters/sceneState'
import type { GameSessionState, TeacherSettings } from '../../src/types'

const settings: TeacherSettings = { replayMode: 'full', soundEnabled: false, supportMode: 'standard' }

describe('factory scene-state adapter', () => {
  it('derives transcription repair and confirmed snapshots from reducer state', () => {
    let state = startRun()
    const round = state.runManifest.rounds[state.currentRoundIndex]
    expect(round.type).toBe('transcription')
    if (round.type !== 'transcription') return

    let snapshot = buildFactorySceneState(state)
    expect(snapshot).toMatchObject({
      activeAction: 'transcription',
      activeCodon: null,
      aminoAcidChain: [],
      changedDnaIndex: null,
      feedbackTitle: '',
      inputLocked: false,
      mrna: '',
      pendingAminoAcid: null,
      repairTarget: null,
      selectedFunction: null,
      stageComplete: false,
    })
    expect(snapshot.stageCue).toEqual({
      focusLabel: 'Base 1',
      prompt: 'Pair DNA bases to build the mRNA message.',
      steps: [`DNA 1: ${round.context.sequence.dnaStrand[0]}`, 'mRNA 1: choose a base'],
      traitColor: null,
    })

    const wrongBase = round.options.find((base) => base !== round.answer[0])!
    state = enterTranscription(state, `${wrongBase}${round.answer.slice(1)}`)
    state = gameReducer(state, { type: 'CHECK_BASE_ROUND' })
    snapshot = buildFactorySceneState(state)

    expect(snapshot.mrna).toBe(`${wrongBase}${round.answer.slice(1)}`)
    expect(snapshot.repairTarget).toEqual(state.roundState.repairTarget)
    expect(snapshot.repairTarget).toMatchObject({ kind: 'base', index: 0, expected: round.answer[0] })
    expect(snapshot.stageCue.focusLabel).toBe('Base 1')
    expect(snapshot.stageCue.steps[1]).toBe(`mRNA 1: ${wrongBase}`)
    expect(snapshot.feedbackTitle).toBe(state.feedback?.title)
    expect(snapshot.feedbackMessage).toBe(state.feedback?.message)
    expect(snapshot.stageComplete).toBe(false)

    state = gameReducer(state, { type: 'APPEND_BASE', base: round.answer[0] })
    state = gameReducer(state, { type: 'CHECK_BASE_ROUND' })
    snapshot = buildFactorySceneState(state)

    expect(snapshot.mrna).toBe(round.answer)
    expect(snapshot.repairTarget).toBeNull()
    expect(snapshot.feedbackTitle).toBe(`${round.shortTitle} complete.`)
    expect(snapshot.stageComplete).toBe(true)
    expect(snapshot.inputLocked).toBe(true)
  })

  it('restores a serialized completed stage as locked, confirmed renderer state', () => {
    const completed = completeCurrentRound(startRun())
    const restored = JSON.parse(JSON.stringify(completed)) as GameSessionState
    const snapshot = buildFactorySceneState(restored)

    expect(restored.screen).toBe('playing')
    expect(snapshot).toMatchObject({
      inputLocked: true,
      mrna: restored.runManifest.rounds[0].context.sequence.mrna,
      stageComplete: true,
    })
    expect(snapshot.repairTarget).toBeNull()
  })

  it('keeps pending, confirmed, and Stop translation signals distinct', () => {
    let state = continueAfterCompleting(startRun())
    const round = state.runManifest.rounds[state.currentRoundIndex]
    expect(round.type).toBe('translation')
    if (round.type !== 'translation') return

    let snapshot = buildFactorySceneState(state)
    expect(snapshot.activeCodon).toBe(round.codons[0])
    expect(snapshot.pendingAminoAcid).toBeNull()
    expect(snapshot.aminoAcidChain).toEqual(['', '', '', ''])
    expect(snapshot.stageCue).toMatchObject({
      focusLabel: 'Codon 1',
      prompt: 'Read this codon to add one amino acid.',
      steps: [`Codon 1: ${round.codons[0]}`, 'Signal: choose an amino acid', 'Growing chain: waiting'],
    })

    state = gameReducer(state, { type: 'SELECT_TRANSLATION', index: 0, value: round.answers[0] })
    snapshot = buildFactorySceneState(state)
    expect(snapshot.activeCodon).toBe(round.codons[0])
    expect(snapshot.pendingAminoAcid).toBe(round.answers[0])
    expect(snapshot.aminoAcidChain[0]).toBe('')
    expect(snapshot.stageCue.steps[1]).toBe(`Signal: ${round.answers[0]}`)

    state = gameReducer(state, { type: 'CHECK_TRANSLATION_CODON' })
    snapshot = buildFactorySceneState(state)
    expect(snapshot.currentCodonIndex).toBe(1)
    expect(snapshot.activeCodon).toBe(round.codons[1])
    expect(snapshot.pendingAminoAcid).toBeNull()
    expect(snapshot.aminoAcidChain[0]).toBe(round.answers[0])

    while (state.roundState.currentCodonIndex < 4) {
      const index = state.roundState.currentCodonIndex
      state = gameReducer(state, { type: 'SELECT_TRANSLATION', index, value: round.answers[index] })
      state = gameReducer(state, { type: 'CHECK_TRANSLATION_CODON' })
    }

    snapshot = buildFactorySceneState(state)
    expect(round.answers[4]).toBe('Stop')
    expect(snapshot.activeCodon).toBe(round.codons[4])
    expect(snapshot.aminoAcidChain).toEqual(round.answers.slice(0, 4))

    state = gameReducer(state, { type: 'SELECT_TRANSLATION', index: 4, value: 'Stop' })
    snapshot = buildFactorySceneState(state)
    expect(snapshot.pendingAminoAcid).toBe('Stop')
    expect(snapshot.aminoAcidChain).toHaveLength(4)
    expect(snapshot.aminoAcidChain).not.toContain('Stop')

    state = gameReducer(state, { type: 'CHECK_TRANSLATION_CODON' })
    snapshot = buildFactorySceneState(state)
    expect(snapshot).toMatchObject({
      activeCodon: round.codons[4],
      currentCodonIndex: 4,
      inputLocked: true,
      pendingAminoAcid: null,
      stageComplete: true,
    })
    expect(snapshot.aminoAcidChain).toEqual(round.context.sequence.aminoAcidChain)
  })

  it('derives function previews, repair feedback, and confirmed products', () => {
    let state = advanceToRound(startRun(), 2)
    const round = state.runManifest.rounds[state.currentRoundIndex]
    expect(round.type).toBe('protein')
    if (round.type !== 'protein') return

    const wrongRow = round.referenceRows.find((row) => row.id !== round.correctRowId)!
    state = gameReducer(state, { type: 'SELECT_FUNCTION_ROW', rowId: wrongRow.id })
    let snapshot = buildFactorySceneState(state)
    expect(snapshot.selectedFunction).toEqual({
      rowId: wrongRow.id,
      proteinFunction: wrongRow.proteinFunction,
      expressedTrait: wrongRow.expressedTrait,
      traitColor: wrongRow.traitColor,
    })
    expect(snapshot.stageCue).toEqual({
      focusLabel: 'Modeled outcome',
      prompt: 'Connect the completed chain to its modeled outcome.',
      steps: [
        `Chain: ${round.context.sequence.aminoAcidChain.join('–')}`,
        `Pigment: ${wrongRow.proteinFunction}`,
        `Trait: ${wrongRow.expressedTrait}`,
      ],
      traitColor: wrongRow.traitColor,
    })
    expect(snapshot.stageComplete).toBe(false)

    state = gameReducer(state, { type: 'CHECK_FUNCTION_ROW' })
    snapshot = buildFactorySceneState(state)
    expect(snapshot.repairTarget).toMatchObject({ kind: 'function-row', expected: round.correctRowId })
    expect(snapshot.selectedFunction?.rowId).toBe(wrongRow.id)
    expect(snapshot.feedbackTitle).toBe(state.feedback?.title)

    state = gameReducer(state, { type: 'SELECT_FUNCTION_ROW', rowId: round.correctRowId })
    expect(buildFactorySceneState(state).repairTarget).toBeNull()
    state = gameReducer(state, { type: 'CHECK_FUNCTION_ROW' })
    snapshot = buildFactorySceneState(state)

    const correctRow = round.referenceRows.find((row) => row.id === round.correctRowId)!
    expect(snapshot.selectedFunction).toMatchObject({
      rowId: correctRow.id,
      proteinFunction: correctRow.proteinFunction,
      expressedTrait: correctRow.expressedTrait,
      traitColor: correctRow.traitColor,
    })
    expect(snapshot.completedProducts).toEqual(state.completedProducts)
    expect(snapshot).toMatchObject({
      inputLocked: true,
      stageComplete: true,
      transitionActive: true,
    })
  })

  it('marks the changed base and focused codon for one-base variant snapshots', () => {
    let state = advanceToRound(startRun(), 3)
    const transcription = state.runManifest.rounds[state.currentRoundIndex]
    expect(transcription.type).toBe('transcription')
    if (transcription.type !== 'transcription') return
    const transcriptionFocus = selectVariantFocus(transcription)!

    let snapshot = buildFactorySceneState(state)
    expect(snapshot.sequenceIndex).toBe(1)
    expect(snapshot.changedDnaIndex).toBe(transcriptionFocus.changedDnaIndex)
    expect(snapshot.dnaStrand[transcriptionFocus.changedDnaIndex]).toBe(
      transcription.context.sequence.dnaStrand[transcriptionFocus.changedDnaIndex],
    )
    expect(snapshot.mrna[transcriptionFocus.changedMrnaIndex]).toBe(' ')

    state = gameReducer(state, {
      type: 'APPEND_BASE',
      base: transcription.answer[transcriptionFocus.changedMrnaIndex],
    })
    state = gameReducer(state, { type: 'CHECK_BASE_ROUND' })
    state = gameReducer(state, { type: 'CONTINUE_AFTER_SUCCESS', now: 9_000 })

    const translation = state.runManifest.rounds[state.currentRoundIndex]
    expect(translation.type).toBe('translation')
    if (translation.type !== 'translation') return
    const translationFocus = selectVariantFocus(translation)!
    snapshot = buildFactorySceneState(state)

    expect(snapshot.changedDnaIndex).toBe(translationFocus.changedDnaIndex)
    expect(snapshot.currentCodonIndex).toBe(translationFocus.changedCodonIndex)
    expect(snapshot.activeCodon).toBe(translation.codons[translationFocus.changedCodonIndex])
    expect(snapshot.aminoAcidChain).toEqual(translation.answers.slice(0, 4).map((answer, index) =>
      index === translationFocus.changedCodonIndex ? '' : answer,
    ))
  })
})

function startRun(): GameSessionState {
  let state = createInitialGameState(1_000)
  state = gameReducer(state, {
    type: 'START_GAME',
    demoMode: false,
    firstName: 'Scene Tester',
    period: '1',
    settings,
    now: 1_000,
  })
  return gameReducer(state, { type: 'START_ROUNDS' })
}

function advanceToRound(state: GameSessionState, targetIndex: number): GameSessionState {
  let next = state
  while (next.currentRoundIndex < targetIndex) next = continueAfterCompleting(next)
  return next
}

function continueAfterCompleting(state: GameSessionState): GameSessionState {
  const completed = completeCurrentRound(state)
  return gameReducer(completed, { type: 'CONTINUE_AFTER_SUCCESS', now: 2_000 + completed.currentRoundIndex })
}

function completeCurrentRound(state: GameSessionState): GameSessionState {
  const round = state.runManifest.rounds[state.currentRoundIndex]
  let next = state
  if (round.type === 'transcription') {
    next = enterTranscription(next, round.answer)
    return gameReducer(next, { type: 'CHECK_BASE_ROUND' })
  }
  if (round.type === 'translation') {
    while (!next.roundResults.some((result) => result.id === round.id)) {
      const index = next.roundState.currentCodonIndex
      next = gameReducer(next, { type: 'SELECT_TRANSLATION', index, value: round.answers[index] })
      next = gameReducer(next, { type: 'CHECK_TRANSLATION_CODON' })
    }
    return next
  }
  next = gameReducer(next, { type: 'SELECT_FUNCTION_ROW', rowId: round.correctRowId })
  return gameReducer(next, { type: 'CHECK_FUNCTION_ROW' })
}

function enterTranscription(state: GameSessionState, sequence: string): GameSessionState {
  let next = state
  for (const [index, base] of [...sequence].entries()) {
    if (next.roundState.input[index] === ' ' || next.roundState.input.length === index) {
      next = gameReducer(next, { type: 'APPEND_BASE', base })
    }
  }
  return next
}
