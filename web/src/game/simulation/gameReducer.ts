import {
  buildRunManifest,
  buildTransferTasks,
  stationIdForRoundType,
} from '../content/rounds'
import {
  createMissedSkill,
  getExpectedAnswer,
  getRoundResult,
  upsertRoundResult,
} from '../../results/gameResults'
import type {
  Feedback,
  GameRound,
  GameSessionState,
  MisconceptionCategory,
  ProteinOption,
  RepairTarget,
  ReplayChallenge,
  RoundState,
  StationId,
  SupportEvent,
  TeacherSettings,
} from '../../types'

export type GameAction =
  | { type: 'START_GAME'; demoMode: boolean; firstName: string; period: string; settings: TeacherSettings; now: number }
  | { type: 'START_ROUNDS' }
  | { type: 'BEGIN_ROUND' }
  | { type: 'SELECT_STATION'; stationId: StationId }
  | { type: 'OPEN_ACTIVE_STATION' }
  | { type: 'CLOSE_TASK_DOCK' }
  | { type: 'APPEND_BASE'; base: string }
  | { type: 'CLEAR_INPUT' }
  | { type: 'BACKSPACE' }
  | { type: 'CHECK_BASE_ROUND' }
  | { type: 'SELECT_TRANSLATION'; index: number; value: string }
  | { type: 'GO_TO_TRANSLATION_CODON'; index: number }
  | { type: 'CHECK_TRANSLATION_CODON' }
  | { type: 'CHECK_FULL_TRANSLATION' }
  | { type: 'SELECT_PROTEIN'; option: ProteinOption }
  | { type: 'CHECK_PROTEIN' }
  | { type: 'TOGGLE_HINT' }
  | { type: 'OPEN_CODON_WHEEL' }
  | { type: 'CLOSE_CODON_WHEEL' }
  | { type: 'CONTINUE_AFTER_SUCCESS'; now: number }
  | { type: 'SUBMIT_TRANSFER'; answer: string; now: number }
  | { type: 'LOCAL_SAVE_FAILED' }
  | { type: 'REPLAY'; now: number }
  | { type: 'RESTART'; now: number }

const defaultSettings: TeacherSettings = {
  replayMode: 'full',
  soundEnabled: false,
  supportMode: 'standard',
}

export function createRoundState(round: GameRound): RoundState {
  return {
    answers: round.type === 'translation' ? new Array(round.codons.length).fill('') : [],
    attempts: 0,
    currentCodonIndex: 0,
    hintUsed: false,
    input: '',
    mistakes: 0,
    narrowedChoices: [],
    repairTarget: null,
    selectedProtein: '',
    selectedTrait: '',
    showHint: false,
    supportEvents: [],
  }
}

export function createInitialGameState(now = Date.now()): GameSessionState {
  const attemptId = createAttemptId(now)
  const runManifest = buildRunManifest(attemptId)
  return {
    attemptId,
    completedAt: null,
    currentRoundIndex: 0,
    currentTransferIndex: 0,
    elapsedSeconds: 0,
    feedback: null,
    identity: { firstName: '', isDemo: false, period: '' },
    isCodonWheelOpen: false,
    missedSkills: [],
    recoveredConcepts: [],
    replayChallenge: null,
    roundResults: [],
    roundState: createRoundState(runManifest.rounds[0]),
    runManifest,
    saveStatus: 'local-draft',
    screen: 'start',
    selectedStationId: null,
    settings: defaultSettings,
    startedAt: now,
    taskDockOpen: false,
    transferResults: [],
    transferTasks: [],
  }
}

export function gameReducer(state: GameSessionState, action: GameAction): GameSessionState {
  const currentRound = state.runManifest.rounds[state.currentRoundIndex]

  switch (action.type) {
    case 'START_GAME': {
      const firstName = action.demoMode ? 'Demo Student' : action.firstName.trim()
      if (!firstName || !action.period) return state
      const fresh = createInitialGameState(action.now)
      return {
        ...fresh,
        identity: { firstName, isDemo: action.demoMode, period: action.period },
        screen: 'tutorial',
        settings: action.settings,
      }
    }
    case 'START_ROUNDS':
      return { ...state, feedback: null, screen: 'intro' }
    case 'BEGIN_ROUND':
      return state.screen === 'intro'
        ? { ...state, feedback: buildStationPrompt(currentRound), screen: 'playing' }
        : state
    case 'SELECT_STATION':
      return state.screen === 'playing' ? selectStation(state, action.stationId) : state
    case 'OPEN_ACTIVE_STATION':
      return state.screen === 'playing'
        ? selectStation(state, stationIdForRoundType(currentRound.type))
        : state
    case 'CLOSE_TASK_DOCK':
      return { ...state, isCodonWheelOpen: false, selectedStationId: null, taskDockOpen: false }
    case 'APPEND_BASE':
      return appendBase(state, currentRound, action.base)
    case 'CLEAR_INPUT':
      return { ...state, feedback: null, roundState: { ...state.roundState, input: '', repairTarget: null } }
    case 'BACKSPACE':
      return {
        ...state,
        feedback: null,
        roundState: { ...state.roundState, input: state.roundState.input.slice(0, -1), repairTarget: null },
      }
    case 'CHECK_BASE_ROUND':
      return checkBaseRound(state, currentRound)
    case 'SELECT_TRANSLATION':
      return selectTranslation(state, currentRound, action.index, action.value)
    case 'GO_TO_TRANSLATION_CODON':
      return currentRound.type === 'translation' && action.index >= 0 && action.index < currentRound.codons.length
        ? { ...state, roundState: { ...state.roundState, currentCodonIndex: action.index } }
        : state
    case 'CHECK_TRANSLATION_CODON':
      return checkTranslationCodon(state, currentRound)
    case 'CHECK_FULL_TRANSLATION':
      return checkFullTranslation(state, currentRound)
    case 'SELECT_PROTEIN':
      return currentRound.type === 'protein' && state.taskDockOpen
        ? {
            ...state,
            feedback: { kind: 'info', title: 'Prediction selected.', message: 'Run the function test when ready.' },
            roundState: {
              ...state.roundState,
              repairTarget: null,
              selectedProtein: action.option.protein,
              selectedTrait: action.option.trait,
            },
          }
        : state
    case 'CHECK_PROTEIN':
      return checkProtein(state, currentRound)
    case 'TOGGLE_HINT':
      return toggleHint(state, currentRound)
    case 'OPEN_CODON_WHEEL':
      return currentRound.type === 'translation'
        ? {
            ...state,
            isCodonWheelOpen: true,
            roundState: addSupportEvent(state.roundState, {
              affectsIndependence: false,
              attempt: state.roundState.attempts,
              choices: [],
              kind: 'codon-chart',
              location: `codon ${state.roundState.currentCodonIndex + 1}`,
              rule: 'Use the mRNA codon chart.',
              stage: currentRound.context.stage,
            }),
          }
        : state
    case 'CLOSE_CODON_WHEEL':
      return { ...state, isCodonWheelOpen: false }
    case 'CONTINUE_AFTER_SUCCESS':
      return state.screen === 'success' ? continueAfterSuccess(state, action.now) : state
    case 'SUBMIT_TRANSFER':
      return submitTransfer(state, action.answer, action.now)
    case 'LOCAL_SAVE_FAILED':
      return state.saveStatus === 'failed-local' ? state : { ...state, saveStatus: 'failed-local' }
    case 'REPLAY':
      return replay(state, action.now)
    case 'RESTART': {
      const fresh = createInitialGameState(action.now)
      return { ...fresh, identity: { firstName: '', isDemo: false, period: state.identity.period }, settings: state.settings }
    }
    default:
      return state
  }
}

export function formatChain(state: RoundState): string {
  return state.answers.filter(Boolean).join('-') || 'not started'
}

export function selectActiveStationId(state: GameSessionState): StationId {
  return stationIdForRoundType(state.runManifest.rounds[state.currentRoundIndex].type)
}

export function selectCompletedStationIds(state: GameSessionState): StationId[] {
  return [...new Set(state.roundResults.filter((result) => result.correct).map((result) => stationIdForRoundType(result.type)))]
}

export function selectReplayChallengeStatus(state: GameSessionState): string {
  return state.replayChallenge?.label ?? ''
}

function appendBase(state: GameSessionState, round: GameRound, base: string): GameSessionState {
  if (!isBaseRound(round) || !state.taskDockOpen) return state
  const repair = state.roundState.repairTarget
  if (repair?.kind === 'base') {
    const padded = state.roundState.input.padEnd(round.answer.length, '-')
    return {
      ...state,
      feedback: { kind: 'info', title: 'Repair placed.', message: 'Check the completed sequence.' },
      roundState: { ...state.roundState, input: replaceAt(padded, repair.index, base), repairTarget: null },
    }
  }
  if (state.roundState.input.length >= round.answer.length) return state
  return { ...state, feedback: null, roundState: { ...state.roundState, input: state.roundState.input + base } }
}

function selectStation(state: GameSessionState, stationId: StationId): GameSessionState {
  const round = state.runManifest.rounds[state.currentRoundIndex]
  const active = stationIdForRoundType(round.type)
  if (stationId !== active) {
    return {
      ...state,
      feedback: { kind: 'info', title: `Go to ${stationLabel(active)}.`, message: 'The highlighted station has the current order.' },
      selectedStationId: active,
      taskDockOpen: false,
    }
  }
  return { ...state, feedback: null, selectedStationId: active, taskDockOpen: true }
}

function checkBaseRound(state: GameSessionState, round: GameRound): GameSessionState {
  if (!isBaseRound(round) || !state.taskDockOpen || state.roundState.input.length !== round.answer.length) return state
  const attempted = { ...state.roundState, attempts: state.roundState.attempts + 1 }
  return attempted.input === round.answer
    ? completeRound(state, round, attempted, attempted.input)
    : recordMistake(state, round, attempted, attempted.input)
}

function selectTranslation(state: GameSessionState, round: GameRound, index: number, value: string): GameSessionState {
  if (round.type !== 'translation' || !state.taskDockOpen) return state
  const answers = [...state.roundState.answers]
  answers[index] = value
  const nextMissing = answers.findIndex((answer, answerIndex) => answerIndex > index && !answer)
  return {
    ...state,
    feedback: null,
    roundState: {
      ...state.roundState,
      answers,
      currentCodonIndex: nextMissing === -1 ? index : nextMissing,
      repairTarget: null,
    },
  }
}

function checkTranslationCodon(state: GameSessionState, round: GameRound): GameSessionState {
  if (round.type !== 'translation' || round.mode !== 'perCodon' || !state.taskDockOpen) return state
  const index = state.roundState.currentCodonIndex
  if (!state.roundState.answers[index]) return state
  const attempted = { ...state.roundState, attempts: state.roundState.attempts + 1 }
  if (attempted.answers[index] !== round.answers[index]) return recordMistake(state, round, attempted, attempted.answers.join('-'))
  if (index < round.answers.length - 1) {
    return { ...state, feedback: { kind: 'success', title: 'Cargo loaded.', message: 'Read the next codon.' }, roundState: { ...attempted, currentCodonIndex: index + 1 } }
  }
  return completeRound(state, round, attempted, attempted.answers.join('-'))
}

function checkFullTranslation(state: GameSessionState, round: GameRound): GameSessionState {
  if (round.type !== 'translation' || round.mode !== 'full' || !state.taskDockOpen || !state.roundState.answers.every(Boolean)) return state
  const attempted = { ...state.roundState, attempts: state.roundState.attempts + 1 }
  const submitted = attempted.answers.join('-')
  return attempted.answers.every((answer, index) => answer === round.answers[index])
    ? completeRound(state, round, attempted, submitted)
    : recordMistake(state, round, attempted, submitted)
}

function checkProtein(state: GameSessionState, round: GameRound): GameSessionState {
  if (round.type !== 'protein' || !state.taskDockOpen || !state.roundState.selectedTrait) return state
  const attempted = { ...state.roundState, attempts: state.roundState.attempts + 1 }
  return attempted.selectedTrait === round.correctTrait
    ? completeRound(state, round, attempted, attempted.selectedTrait, attempted.selectedProtein, attempted.selectedTrait)
    : recordMistake(state, round, attempted, attempted.selectedTrait)
}

function toggleHint(state: GameSessionState, round: GameRound): GameSessionState {
  const showHint = !state.roundState.showHint
  const next = showHint
    ? addSupportEvent(state.roundState, {
        affectsIndependence: true,
        attempt: state.roundState.attempts,
        choices: [],
        kind: 'explicit-hint',
        location: round.shortTitle,
        rule: round.hint,
        stage: round.context.stage,
      })
    : state.roundState
  return { ...state, roundState: { ...next, hintUsed: next.hintUsed || showHint, showHint } }
}

function recordMistake(state: GameSessionState, round: GameRound, attempted: RoundState, submitted: string): GameSessionState {
  const repairTarget = buildRepairTarget(round, submitted, attempted)
  const mistakeNumber = attempted.mistakes + 1
  const shouldNarrow = state.settings.supportMode === 'guided' || mistakeNumber >= 2
  const narrowedChoices = shouldNarrow ? getNarrowedChoices(round, repairTarget) : []
  const supportEvent: SupportEvent = {
    affectsIndependence: true,
    attempt: attempted.attempts,
    choices: narrowedChoices,
    kind: shouldNarrow ? 'narrowed-choices' : 'error-location-rule',
    location: repairTarget?.label ?? round.shortTitle,
    rule: diagnosticRule(round, repairTarget),
    stage: round.context.stage,
  }
  const roundState = {
    ...addSupportEvent(attempted, supportEvent),
    currentCodonIndex: repairTarget?.kind === 'codon' ? repairTarget.index : attempted.currentCodonIndex,
    mistakes: mistakeNumber,
    narrowedChoices,
    repairTarget,
  }
  const category = repairTarget?.category ?? fallbackCategory(round)
  return {
    ...state,
    feedback: buildErrorFeedback(round, roundState, mistakeNumber),
    missedSkills: [...state.missedSkills, createMissedSkill(round, state.currentRoundIndex, roundState, submitted, 'mistake', category)],
    roundState,
  }
}

function completeRound(
  state: GameSessionState,
  round: GameRound,
  roundState: RoundState,
  submitted: string,
  selectedProtein = '',
  selectedTrait = '',
): GameSessionState {
  const result = getRoundResult(round, state.currentRoundIndex, roundState, submitted, true, selectedProtein, selectedTrait)
  return {
    ...state,
    feedback: {
      detail: `Produced: ${getExpectedAnswer(round)}`,
      kind: 'success',
      message: shipmentMessage(round),
      title: round.context.orderRole === 'normal' ? 'Order A stage complete' : 'Order B stage complete',
    },
    isCodonWheelOpen: false,
    roundResults: upsertRoundResult(state.roundResults, result),
    roundState: { ...roundState, narrowedChoices: [], repairTarget: null },
    saveStatus: 'saved-local',
    screen: 'success',
    selectedStationId: stationIdForRoundType(round.type),
    taskDockOpen: false,
  }
}

function continueAfterSuccess(state: GameSessionState, now: number): GameSessionState {
  const rounds = state.runManifest.rounds
  if (state.currentRoundIndex === rounds.length - 1) {
    const transferTasks = buildTransferTasks(state.runManifest, state.roundResults)
    if (transferTasks.length > 0) {
      return { ...state, currentTransferIndex: 0, feedback: null, screen: 'transfer', transferTasks }
    }
    return finishRun(state, now)
  }
  const currentRoundIndex = state.currentRoundIndex + 1
  const round = rounds[currentRoundIndex]
  return {
    ...state,
    currentRoundIndex,
    feedback: null,
    roundState: createRoundState(round),
    saveStatus: 'local-draft',
    screen: 'playing',
    selectedStationId: stationIdForRoundType(round.type),
    taskDockOpen: true,
  }
}

function submitTransfer(state: GameSessionState, answer: string, now: number): GameSessionState {
  if (state.screen !== 'transfer') return state
  const task = state.transferTasks[state.currentTransferIndex]
  if (!task) return finishRun(state, now)
  const recovered = answer === task.expected
  const transferResults = [...state.transferResults, {
    expected: task.expected,
    recovered,
    sourcePairId: task.sourcePairId,
    submitted: answer,
    targetCategory: task.targetCategory,
    targetStage: task.targetStage,
    taskId: task.id,
  }]
  const recoveredConcepts = recovered && !state.recoveredConcepts.includes(task.targetCategory)
    ? [...state.recoveredConcepts, task.targetCategory]
    : state.recoveredConcepts
  if (state.currentTransferIndex < state.transferTasks.length - 1) {
    return { ...state, currentTransferIndex: state.currentTransferIndex + 1, recoveredConcepts, transferResults }
  }
  return finishRun({ ...state, recoveredConcepts, transferResults }, now)
}

function finishRun(state: GameSessionState, now: number): GameSessionState {
  return {
    ...state,
    completedAt: now,
    elapsedSeconds: Math.max(1, Math.round((now - state.startedAt) / 1000)),
    feedback: null,
    saveStatus: 'saved-local',
    screen: 'end',
  }
}

function replay(state: GameSessionState, now: number): GameSessionState {
  const fresh = createInitialGameState(now)
  const runManifest = buildRunManifest(fresh.attemptId, [state.runManifest.pairId])
  if (state.settings.replayMode === 'targeted') {
    const transferTasks = buildTransferTasks(state.runManifest, state.roundResults, fresh.attemptId)
    if (transferTasks.length > 0) {
      return {
        ...fresh,
        identity: state.identity,
        replayChallenge: buildReplayChallenge(state),
        runManifest,
        screen: 'transfer',
        settings: state.settings,
        transferTasks,
      }
    }
  }
  return {
    ...fresh,
    identity: state.identity,
    replayChallenge: buildReplayChallenge(state),
    roundState: createRoundState(runManifest.rounds[0]),
    runManifest,
    screen: 'intro',
    settings: state.settings,
  }
}

function addSupportEvent(roundState: RoundState, event: SupportEvent): RoundState {
  const duplicate = roundState.supportEvents.some((item) => item.kind === event.kind && item.location === event.location)
  return duplicate ? roundState : { ...roundState, supportEvents: [...roundState.supportEvents, event] }
}

function buildRepairTarget(round: GameRound, submitted: string, state: RoundState): RepairTarget | null {
  if (isBaseRound(round)) {
    const index = Math.max(0, findFirstMismatch(submitted, round.answer))
    const expected = round.answer[index]
    const submittedBase = submitted[index] ?? 'blank'
    return {
      category: round.type === 'transcription' && (submittedBase === 'T' || expected === 'U') ? 'rna-uses-u' : round.type === 'dna' ? 'dna-base-pairing' : 'rna-template-pairing',
      expected,
      index,
      kind: 'base',
      label: `position ${index + 1}: ${round.template[index]} pairs with ${expected}`,
      submitted: submittedBase,
    }
  }
  if (round.type === 'translation') {
    const mismatch = round.answers.findIndex((answer, index) => state.answers[index] !== answer)
    const index = Math.max(0, mismatch)
    return {
      category: state.answers[index] ? 'codon-lookup' : 'codon-grouping',
      expected: round.answers[index],
      index,
      kind: 'codon',
      label: `codon ${index + 1}: ${round.codons[index]} codes for ${round.answers[index]}`,
      submitted: state.answers[index] || 'blank',
    }
  }
  if (round.type === 'protein') {
    return {
      category: 'protein-trait-model',
      expected: round.correctTrait,
      index: 0,
      kind: 'protein',
      label: 'compare the normal and variant chains before predicting pigment output',
      submitted: state.selectedTrait || 'blank',
    }
  }
  return null
}

function getNarrowedChoices(round: GameRound, target: RepairTarget | null): string[] {
  if (!target) return []
  if (isBaseRound(round)) return [target.expected, ...round.options.filter((item) => item !== target.expected).slice(0, 1)]
  if (round.type === 'translation') return [target.expected, ...round.codonChoices[target.index].filter((item) => item !== target.expected).slice(0, 1)]
  return 'correctTrait' in round
    ? [target.expected, ...round.options.map((item) => item.trait).filter((item) => item !== target.expected).slice(0, 1)]
    : [target.expected]
}

function diagnosticRule(round: GameRound, target: RepairTarget | null): string {
  if (round.type === 'dna') return `Use A-T and C-G pairing at ${target?.label ?? 'the highlighted position'}.`
  if (round.type === 'transcription') return `Pair RNA to template DNA and use U, not T, at ${target?.label ?? 'the highlighted position'}.`
  if (round.type === 'translation') return `Read one complete mRNA codon at ${target?.label ?? 'the highlighted codon'}.`
  return 'Use the chain length and changed amino acid to predict enzyme activity and pigment output.'
}

function buildErrorFeedback(round: GameRound, state: RoundState, mistakeNumber: number): Feedback {
  const target = state.repairTarget
  return {
    detail: mistakeNumber >= 2 && state.narrowedChoices.length > 0 ? `Choices narrowed to ${state.narrowedChoices.join(' or ')}.` : undefined,
    kind: 'error',
    message: diagnosticRule(round, target),
    title: mistakeNumber >= 2 ? 'Recalibrate the highlighted part.' : 'Inspect the highlighted mismatch.',
  }
}

function shipmentMessage(round: GameRound): string {
  if (round.type === 'dna') return 'The complementary DNA tray is moving to transcription.'
  if (round.type === 'transcription') return 'The exact mRNA strip is moving to the ribosome line.'
  if (round.type === 'translation') return 'The translated chain is moving to the function chamber.'
  return 'correctTrait' in round ? round.correctTrait : 'Protein function test complete.'
}

function buildStationPrompt(round: GameRound): Feedback {
  return { kind: 'info', message: 'Tap the highlighted station to load the current order.', title: stationLabel(stationIdForRoundType(round.type)) }
}

function fallbackCategory(round: GameRound): MisconceptionCategory {
  if (round.type === 'dna') return 'dna-base-pairing'
  if (round.type === 'transcription') return 'rna-template-pairing'
  if (round.type === 'translation') return 'codon-lookup'
  return 'protein-trait-model'
}

function buildReplayChallenge(state: GameSessionState): ReplayChallenge {
  const target = state.roundResults.find((result) => !result.independent)
  return target
    ? { baselineMistakes: target.mistakes, label: `Clear ${target.title} independently with a new order.`, roundId: target.id, roundTitle: target.title, type: target.hintUsed ? 'no-hint-round' : 'repair-round' }
    : { baselineMistakes: 0, label: 'Complete another precise production run.', type: 'perfect-run' }
}

function findFirstMismatch(submitted: string, expected: string): number {
  return [...expected].findIndex((base, index) => submitted[index] !== base)
}

function replaceAt(input: string, index: number, value: string): string {
  return `${input.slice(0, index)}${value}${input.slice(index + 1)}`
}

function createAttemptId(now: number): string {
  const uuid = globalThis.crypto?.randomUUID?.()
  return uuid ? `pf-${uuid}` : `pf-${now}-${Math.random().toString(36).slice(2, 8)}`
}

function isBaseRound(round: GameRound): round is Extract<GameRound, { type: 'dna' | 'transcription' }> {
  return round.type === 'dna' || round.type === 'transcription'
}

function stationLabel(stationId: StationId): string {
  if (stationId === 'dna-dock') return 'DNA Assembly Bench'
  if (stationId === 'transcription-press') return 'Transcription Press'
  if (stationId === 'ribosome-galley') return 'Ribosome Line'
  return 'Function Test Chamber'
}
