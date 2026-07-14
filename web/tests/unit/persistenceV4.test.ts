import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createInitialGameState,
  gameReducer,
  normalizeResumedGameState,
  selectVariantFocus,
} from '../../src/game/simulation/gameReducer'
import { buildFinalPayload } from '../../src/results/gameResults'
import { toProteinFactoryAttemptV4 } from '../../src/results/appsScriptMapper'
import {
  checkpointSchemaVersion,
  isValidCheckpointEnvelopeV4,
  readLocalCheckpoint,
  readLocalResultHistory,
  saveLocalCheckpoint,
  saveLocalResult,
} from '../../src/results/localResultSaver'
import { isValidAttempt } from '../../api/attempt.js'
import type {
  FinalGamePayload,
  GameSessionState,
} from '../../src/types'

const checkpointKey = 'pirate-protein-factory:last-checkpoint'
const historyKey = 'pirate-protein-factory:payload-history'

describe('V4 local persistence', () => {
  let storage: Storage

  beforeEach(() => {
    storage = memoryStorage()
    vi.stubGlobal('window', { localStorage: storage })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('round-trips a reducer-produced V4 checkpoint including codon repair, products, and seed', () => {
    const state = makeCheckpointState()

    expect(saveLocalCheckpoint(state)).toEqual({ ok: true })
    const restored = readLocalCheckpoint()

    expect(restored?.schemaVersion).toBe(checkpointSchemaVersion)
    expect(restored?.state).toEqual(state)
    expect(restored?.state.roundState.currentCodonIndex).toBe(state.roundState.currentCodonIndex)
    expect(restored?.state.roundState.repairTarget?.kind).toBe('codon')
    expect(restored?.state.completedProducts).toHaveLength(1)
    expect(restored?.state.runManifest.seed).toBe(state.runManifest.seed)
  })

  it('normalizes a resumed legacy-style variant cursor without changing saved evidence', () => {
    let state = startReducerRun()
    for (let index = 0; index < 4; index += 1) state = completeAndContinue(state)
    const round = state.runManifest.rounds[state.currentRoundIndex]
    if (round.type !== 'translation') throw new Error('Expected variant translation fixture round')
    const focus = selectVariantFocus(round)!
    const legacyRoundState = {
      ...state.roundState,
      answers: new Array(round.answers.length).fill(''),
      attempts: 4,
      currentCodonIndex: 0,
      hintUsed: true,
      mistakes: 2,
      pendingTranslationChoice: '',
      showHint: true,
      supportEvents: [{
        action: 'translation' as const,
        affectsIndependence: true,
        attempt: 4,
        choices: [],
        kind: 'error-location-rule' as const,
        location: 'legacy codon',
        rule: 'legacy rule',
      }],
    }
    state = { ...state, roundState: legacyRoundState }

    expect(saveLocalCheckpoint(state)).toEqual({ ok: true })
    const restored = readLocalCheckpoint()!
    const normalized = normalizeResumedGameState(restored.state)

    expect(normalized.roundResults).toBe(restored.state.roundResults)
    expect(normalized.missedSkills).toBe(restored.state.missedSkills)
    expect(normalized.completedProducts).toBe(restored.state.completedProducts)
    expect(normalized.roundState).toMatchObject({ attempts: 4, hintUsed: true, mistakes: 2, showHint: true })
    expect(normalized.roundState.supportEvents).toBe(restored.state.roundState.supportEvents)
    expect(normalized.roundState.currentCodonIndex).toBe(focus.changedCodonIndex)
    expect(normalized.roundState.answers).toEqual(
      round.answers.map((answer, index) => index === focus.changedCodonIndex ? '' : answer),
    )
  })

  it('rejects an incompatible V3 checkpoint without deleting V3 completed history', () => {
    const legacyHistory = [{
      attemptId: 'legacy-complete-v3',
      schemaVersion: 'protein-factory-attempt-v3',
      studentName: 'Ada',
    }]
    storage.setItem(checkpointKey, JSON.stringify({
      contentVersion: 'protein-factory-v3',
      savedAt: new Date().toISOString(),
      schemaVersion: 'checkpoint-envelope-v3',
      state: { attemptId: 'legacy-checkpoint-v3' },
    }))
    storage.setItem(historyKey, JSON.stringify(legacyHistory))

    expect(readLocalCheckpoint()).toBeNull()
    expect(storage.getItem(checkpointKey)).not.toBeNull()
    expect(readLocalResultHistory()).toEqual(legacyHistory)
  })

  it('rejects a malformed V4 checkpoint before UI rehydration', () => {
    expect(saveLocalCheckpoint(makeCheckpointState())).toEqual({ ok: true })
    const malformed = JSON.parse(storage.getItem(checkpointKey) || '{}')
    malformed.state.runManifest.rounds[0].context.sequence.mrnaCodons = ['AUG']
    storage.setItem(checkpointKey, JSON.stringify(malformed))
    expect(readLocalCheckpoint()).toBeNull()
  })

  it('rejects checkpoints that violate reducer state-machine invariants', () => {
    const playing = makeCheckpointState()
    const envelope = {
      schemaVersion: checkpointSchemaVersion,
      savedAt: '2026-07-12T12:00:00.000Z',
      state: playing,
    }
    expect(isValidCheckpointEnvelopeV4(envelope)).toBe(true)

    expect(isValidCheckpointEnvelopeV4({
      ...envelope,
      state: { ...playing, screen: 'end', completedAt: 2_000 },
    })).toBe(false)
    expect(isValidCheckpointEnvelopeV4({
      ...envelope,
      state: { ...playing, screen: 'sequence-transition' },
    })).toBe(false)
    expect(isValidCheckpointEnvelopeV4({
      ...envelope,
      state: { ...playing, attemptKind: 'targeted-practice', parentAttemptId: null },
    })).toBe(false)
  })

  it('rejects a targeted-practice checkpoint whose cursor points past its only task', () => {
    let state = startReducerRun()
    const firstRound = state.runManifest.rounds[0]
    if (firstRound.type !== 'transcription') throw new Error('Expected transcription fixture round')
    const lastBase = firstRound.answer.at(-1)!
    const wrongBase = lastBase === 'A' ? 'U' : 'A'
    for (const base of firstRound.answer.slice(0, -1)) state = gameReducer(state, { type: 'APPEND_BASE', base })
    state = gameReducer(state, { type: 'APPEND_BASE', base: wrongBase })
    state = gameReducer(state, { type: 'CHECK_BASE_ROUND' })
    state = gameReducer(state, { type: 'BACKSPACE' })
    state = gameReducer(state, { type: 'APPEND_BASE', base: lastBase })
    state = gameReducer(state, { type: 'CHECK_BASE_ROUND' })
    state = gameReducer(state, { type: 'CONTINUE_AFTER_SUCCESS', now: 2_000 })

    while (state.screen === 'playing' || state.screen === 'sequence-transition') {
      if (!state.roundResults.some((result) => result.round === state.currentRoundIndex + 1)) state = completeCurrentAction(state)
      state = gameReducer(state, { type: 'CONTINUE_AFTER_SUCCESS', now: 3_000 + state.currentRoundIndex * 1_000 })
    }
    state = { ...state, settings: { ...state.settings, replayMode: 'targeted' } }
    state = gameReducer(state, { type: 'REPLAY', now: 20_000 })

    const envelope = {
      schemaVersion: checkpointSchemaVersion,
      savedAt: '2026-07-12T12:00:00.000Z',
      state,
    }
    expect(state.screen).toBe('transfer')
    expect(isValidCheckpointEnvelopeV4(envelope)).toBe(true)
    expect(isValidCheckpointEnvelopeV4({
      ...envelope,
      state: { ...state, currentTransferIndex: 1 },
    })).toBe(false)
  })

  it('keeps the newest 30 results while retaining older V3 records', () => {
    const legacy = Array.from({ length: 30 }, (_, index) => ({
      attemptId: `legacy-v3-${index}`,
      schemaVersion: 'protein-factory-attempt-v3',
    }))
    storage.setItem(historyKey, JSON.stringify(legacy))

    saveLocalResult(makePayload('new-v4-attempt', false))
    const history = readLocalResultHistory()

    expect(history).toHaveLength(30)
    expect(history[0].attemptId).toBe('new-v4-attempt')
    expect(history.filter((item) => item.schemaVersion === 'protein-factory-attempt-v3')).toHaveLength(29)
  })
})

describe('V4 submission mapping and validation', () => {
  it('maps all three sequence IDs, both effects, nine results, and product outcomes', () => {
    const payload = makePayload('completed-v4-attempt', true)
    const attempt = toProteinFactoryAttemptV4(payload)

    expect(attempt.schemaVersion).toBe('protein-factory-v4')
    expect(attempt.runManifest.sequenceIds).toHaveLength(3)
    expect(attempt.runManifest.effects).toEqual(['same-chain', 'amino-acid-change'])
    expect(attempt.stageResults).toHaveLength(9)
    expect(attempt.completedProducts.map((product) => product.expressedTrait)).toHaveLength(3)
    expect(isValidAttempt(attempt)).toBe(true)
  })

  it('accepts legacy V3 and rejects incomplete completed V4 attempts', () => {
    expect(isValidAttempt({
      attemptId: 'legacy-v3-attempt',
      classPeriod: '2',
      schemaVersion: 'protein-factory-attempt-v3',
      stageResults: [],
      studentName: 'Ada',
      transferResults: [],
    })).toBe(true)

    const invalid = makePayload('invalid-v4-attempt', true)
    invalid.stageResults = invalid.stageResults.slice(0, 8)
    invalid.roundResults = invalid.roundResults.slice(0, 8)
    expect(isValidAttempt(invalid)).toBe(false)

    const duplicated = makePayload('duplicate-stage-v4', true)
    duplicated.stageResults = Array.from({ length: 9 }, () => duplicated.stageResults[0])
    duplicated.roundResults = [...duplicated.stageResults]
    expect(isValidAttempt(duplicated)).toBe(false)
  })
})

function makeCheckpointState(): GameSessionState {
  let state = startReducerRun()
  for (let index = 0; index < 4; index += 1) state = completeAndContinue(state)
  const round = state.runManifest.rounds[state.currentRoundIndex]
  if (round.type !== 'translation') throw new Error('Expected translation fixture round')
  const focus = selectVariantFocus(round)
  if (!focus) throw new Error('Expected focused variant translation round')
  const index = focus.changedCodonIndex
  const wrong = round.codonChoices[index].find((choice) => choice !== round.answers[index])!
  state = gameReducer(state, { type: 'SELECT_TRANSLATION', index, value: wrong })
  state = gameReducer(state, { type: 'CHECK_TRANSLATION_CODON' })
  state = gameReducer(state, { type: 'TOGGLE_HINT' })
  return { ...state, elapsedSeconds: 45 }
}

function makePayload(attemptId: string, completed: boolean): FinalGamePayload {
  let state = startReducerRun()
  if (completed) {
    while (state.screen === 'playing' || state.screen === 'sequence-transition') {
      if (!state.roundResults.some((result) => result.round === state.currentRoundIndex + 1)) state = completeCurrentAction(state)
      state = gameReducer(state, { type: 'CONTINUE_AFTER_SUCCESS', now: 20_000 + state.currentRoundIndex * 1_000 })
    }
  }
  return buildFinalPayload({ ...state, attemptId })
}

function startReducerRun(): GameSessionState {
  let state = createInitialGameState(1_000)
  state = gameReducer(state, {
    type: 'START_GAME',
    demoMode: false,
    firstName: 'Ada',
    period: '2',
    settings: { replayMode: 'full', soundEnabled: false, supportMode: 'guided' },
    now: 1_000,
  })
  return gameReducer(state, { type: 'START_ROUNDS' })
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
      : [...round.answer].reduce((current, base) => gameReducer(current, { type: 'APPEND_BASE', base }), next)
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

function memoryStorage(): Storage {
  const values = new Map<string, string>()
  return {
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    get length() { return values.size },
    removeItem: (key) => { values.delete(key) },
    setItem: (key, value) => { values.set(key, value) },
  }
}
