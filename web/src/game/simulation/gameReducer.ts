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
  ProductSnapshot,
  RepairTarget,
  ReplayChallenge,
  RoundState,
  StationId,
  SupportEvent,
  TeacherSettings,
} from '../../types'
import {
  buildVariantTranscriptionInput,
  buildVariantTranslationAnswers,
  selectVariantFocus,
  variantInputBlank,
} from './variantFocus'

export {
  selectCurrentVariantComparisonConsequences,
  selectVariantComparisonConsequences,
  selectVariantFocus,
} from './variantFocus'

export type GameAction =
  | { type: 'START_GAME'; demoMode: boolean; firstName: string; period: string; settings: TeacherSettings; now: number }
  | { type: 'START_ROUNDS' }
  | { type: 'BEGIN_ROUND' }
  | { type: 'APPEND_BASE'; base: string }
  | { type: 'CLEAR_INPUT' }
  | { type: 'BACKSPACE' }
  | { type: 'CHECK_BASE_ROUND' }
  | { type: 'SELECT_TRANSLATION'; index: number; value: string }
  | { type: 'GO_TO_TRANSLATION_CODON'; index: number }
  | { type: 'CHECK_TRANSLATION_CODON' }
  | { type: 'SELECT_FUNCTION_ROW'; rowId: string }
  | { type: 'CHECK_FUNCTION_ROW' }
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
  const focus = selectVariantFocus(round)
  const variantInput = round.type === 'transcription' ? buildVariantTranscriptionInput(round) : null
  const variantAnswers = round.type === 'translation' ? buildVariantTranslationAnswers(round) : null
  return {
    answers: round.type === 'translation' ? variantAnswers ?? new Array(round.codons.length).fill('') : [],
    attempts: 0,
    currentCodonIndex: round.type === 'translation' ? focus?.changedCodonIndex ?? 0 : 0,
    hintUsed: false,
    input: variantInput ?? '',
    mistakes: 0,
    narrowedChoices: [],
    pendingTranslationChoice: '',
    repairTarget: null,
    selectedFunctionRowId: '',
    showHint: false,
    supportEvents: [],
  }
}

export function normalizeResumedGameState(state: GameSessionState): GameSessionState {
  if (state.screen !== 'playing' || isCurrentRoundComplete(state)) return state
  const round = state.runManifest.rounds[state.currentRoundIndex]
  if (!round || !selectVariantFocus(round)) return state
  const roundState = normalizeVariantRoundState(round, state.roundState)
  return roundState === state.roundState ? state : { ...state, roundState }
}

export function createInitialGameState(now = Date.now()): GameSessionState {
  const attemptId = createAttemptId(now)
  const runManifest = buildRunManifest(attemptId)
  return {
    attemptId,
    attemptKind: 'full-run',
    parentAttemptId: null,
    completedAt: null,
    completedProducts: [],
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
    settings: defaultSettings,
    startedAt: now,
    transferResults: [],
    transferTasks: [],
  }
}

export function gameReducer(state: GameSessionState, action: GameAction): GameSessionState {
  state = normalizeResumedGameState(state)
  const currentRound = state.runManifest.rounds[state.currentRoundIndex]

  switch (action.type) {
    case 'START_GAME': {
      if (state.screen !== 'start') return state
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
      return state.screen === 'tutorial' ? { ...state, feedback: null, screen: 'playing' } : state
    case 'BEGIN_ROUND':
      return state
    case 'APPEND_BASE':
      return appendBase(state, currentRound, action.base)
    case 'CLEAR_INPUT':
      return clearTranscriptionInput(state, currentRound)
    case 'BACKSPACE':
      return backspaceTranscriptionInput(state, currentRound)
    case 'CHECK_BASE_ROUND':
      return checkBaseRound(state, currentRound)
    case 'SELECT_TRANSLATION':
      return selectTranslation(state, currentRound, action.index, action.value)
    case 'GO_TO_TRANSLATION_CODON':
      return goToTranslationCodon(state, currentRound, action.index)
    case 'CHECK_TRANSLATION_CODON':
      return checkTranslationCodon(state, currentRound)
    case 'SELECT_FUNCTION_ROW':
      return selectFunctionRow(state, currentRound, action.rowId)
    case 'CHECK_FUNCTION_ROW':
      return checkFunctionRow(state, currentRound)
    case 'TOGGLE_HINT':
      return toggleHint(state, currentRound)
    case 'OPEN_CODON_WHEEL':
      return openCodonWheel(state, currentRound)
    case 'CLOSE_CODON_WHEEL':
      return state.isCodonWheelOpen ? { ...state, isCodonWheelOpen: false } : state
    case 'CONTINUE_AFTER_SUCCESS':
      return continueAfterSuccess(state, action.now)
    case 'SUBMIT_TRANSFER':
      return submitTransfer(state, action.answer, action.now)
    case 'LOCAL_SAVE_FAILED':
      return state.saveStatus === 'failed-local' ? state : { ...state, saveStatus: 'failed-local' }
    case 'REPLAY':
      return state.screen === 'end' ? replay(state, action.now) : state
    case 'RESTART': {
      if (state.screen !== 'end') return state
      const fresh = createInitialGameState(action.now)
      return { ...fresh, identity: { firstName: '', isDemo: false, period: state.identity.period }, settings: state.settings }
    }
    default:
      return state
  }
}

export function formatChain(state: RoundState): string {
  return state.answers.filter((answer) => answer && answer !== 'Stop').join('-') || 'not started'
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

function canEditRound(state: GameSessionState): boolean {
  return state.screen === 'playing' && !isCurrentRoundComplete(state)
}

function isCurrentRoundComplete(state: GameSessionState): boolean {
  return state.roundResults.some((result) => result.round === state.currentRoundIndex + 1 && result.correct)
}

function normalizeVariantRoundState(round: GameRound, state: RoundState): RoundState {
  const focus = selectVariantFocus(round)
  if (!focus) return state

  if (round.type === 'transcription') {
    const draftBase = state.input[focus.changedMrnaIndex] ?? ''
    const input = replaceAt(
      round.answer,
      focus.changedMrnaIndex,
      round.options.some((base) => base === draftBase) ? draftBase : variantInputBlank,
    )
    const repairTarget = state.repairTarget?.kind === 'base' && state.repairTarget.index === focus.changedMrnaIndex
      ? state.repairTarget
      : null
    const narrowedChoices = repairTarget ? state.narrowedChoices : []
    if (
      state.input === input
      && state.answers.length === 0
      && state.currentCodonIndex === 0
      && state.pendingTranslationChoice === ''
      && state.repairTarget === repairTarget
      && sameStrings(state.narrowedChoices, narrowedChoices)
    ) return state
    return {
      ...state,
      answers: [],
      currentCodonIndex: 0,
      input,
      narrowedChoices,
      pendingTranslationChoice: '',
      repairTarget,
    }
  }

  if (round.type === 'translation') {
    const answers = buildVariantTranslationAnswers(round)
    if (!answers) return state
    const choices = round.codonChoices[focus.changedCodonIndex] ?? []
    const pendingCandidates = state.currentCodonIndex === focus.changedCodonIndex
      ? [state.pendingTranslationChoice, state.answers[focus.changedCodonIndex]]
      : [state.answers[focus.changedCodonIndex]]
    const pendingTranslationChoice = pendingCandidates.find((choice) => choices.includes(choice)) ?? ''
    const repairTarget = state.repairTarget?.kind === 'codon' && state.repairTarget.index === focus.changedCodonIndex
      ? state.repairTarget
      : null
    const narrowedChoices = repairTarget ? state.narrowedChoices : []
    if (
      state.input === ''
      && sameStrings(state.answers, answers)
      && state.currentCodonIndex === focus.changedCodonIndex
      && state.pendingTranslationChoice === pendingTranslationChoice
      && state.repairTarget === repairTarget
      && sameStrings(state.narrowedChoices, narrowedChoices)
    ) return state
    return {
      ...state,
      answers,
      currentCodonIndex: focus.changedCodonIndex,
      input: '',
      narrowedChoices,
      pendingTranslationChoice,
      repairTarget,
    }
  }

  return state
}

function clearTranscriptionInput(state: GameSessionState, round: GameRound): GameSessionState {
  if (round.type !== 'transcription' || !canEditRound(state)) return state
  const input = buildVariantTranscriptionInput(round) ?? ''
  return {
    ...state,
    feedback: null,
    roundState: { ...state.roundState, input, repairTarget: null },
  }
}

function backspaceTranscriptionInput(state: GameSessionState, round: GameRound): GameSessionState {
  if (round.type !== 'transcription' || !canEditRound(state)) return state
  const input = buildVariantTranscriptionInput(round) ?? state.roundState.input.slice(0, -1)
  return {
    ...state,
    feedback: null,
    roundState: { ...state.roundState, input, repairTarget: null },
  }
}

function appendBase(state: GameSessionState, round: GameRound, base: string): GameSessionState {
  if (round.type !== 'transcription' || !canEditRound(state) || !round.options.includes(base as never)) return state
  const repair = state.roundState.repairTarget
  if (repair?.kind === 'base') {
    return {
      ...state,
      feedback: { kind: 'info', title: 'Repair placed.', message: 'Check the completed mRNA strand.' },
      roundState: {
        ...state.roundState,
        input: replaceAt(state.roundState.input, repair.index, base),
        repairTarget: null,
      },
    }
  }
  const focus = selectVariantFocus(round)
  if (focus) {
    const input = replaceAt(round.answer, focus.changedMrnaIndex, base)
    return input === state.roundState.input
      ? state
      : { ...state, feedback: null, roundState: { ...state.roundState, input } }
  }
  if (state.roundState.input.length >= round.answer.length) return state
  return { ...state, feedback: null, roundState: { ...state.roundState, input: state.roundState.input + base } }
}

function checkBaseRound(state: GameSessionState, round: GameRound): GameSessionState {
  if (round.type !== 'transcription' || !canEditRound(state) || !isTranscriptionReady(round, state.roundState.input)) return state
  const attempted = { ...state.roundState, attempts: state.roundState.attempts + 1 }
  return attempted.input === round.answer
    ? completeRound(state, round, attempted, attempted.input)
    : recordMistake(state, round, attempted, attempted.input)
}

function selectTranslation(state: GameSessionState, round: GameRound, index: number, value: string): GameSessionState {
  if (
    round.type !== 'translation'
    || !canEditRound(state)
    || index !== state.roundState.currentCodonIndex
    || state.roundState.answers[index]
    || !round.codonChoices[index]?.includes(value)
  ) return state
  if (state.roundState.pendingTranslationChoice === value) return state
  return {
    ...state,
    feedback: null,
    roundState: {
      ...state.roundState,
      narrowedChoices: [],
      pendingTranslationChoice: value,
      repairTarget: null,
    },
  }
}

function goToTranslationCodon(state: GameSessionState, round: GameRound, index: number): GameSessionState {
  if (round.type !== 'translation' || !canEditRound(state) || index !== firstOpenCodon(state.roundState.answers)) return state
  return index === state.roundState.currentCodonIndex
    ? state
    : { ...state, roundState: { ...state.roundState, currentCodonIndex: index, pendingTranslationChoice: '' } }
}

function checkTranslationCodon(state: GameSessionState, round: GameRound): GameSessionState {
  if (round.type !== 'translation' || !canEditRound(state) || !state.roundState.pendingTranslationChoice) return state
  const index = state.roundState.currentCodonIndex
  const attempted = { ...state.roundState, attempts: state.roundState.attempts + 1 }
  const submitted = translationSubmission(attempted, index)
  if (attempted.pendingTranslationChoice !== round.answers[index]) {
    return recordMistake(state, round, attempted, submitted)
  }

  const answers = [...attempted.answers]
  answers[index] = attempted.pendingTranslationChoice
  const checked = {
    ...attempted,
    answers,
    narrowedChoices: [],
    pendingTranslationChoice: '',
    repairTarget: null,
  }
  if (answers.every(Boolean)) return completeRound(state, round, checked, answers.join('-'))

  const currentCodonIndex = firstOpenCodon(answers)
  return {
    ...state,
    feedback: { kind: 'info', title: 'Codon checked.', message: 'Select an answer for the next mRNA codon.' },
    roundState: { ...checked, currentCodonIndex },
  }
}

function selectFunctionRow(state: GameSessionState, round: GameRound, rowId: string): GameSessionState {
  if (round.type !== 'protein' || !canEditRound(state) || !round.referenceRows.some((row) => row.id === rowId)) return state
  if (state.roundState.selectedFunctionRowId === rowId) return state
  return {
    ...state,
    feedback: null,
    roundState: {
      ...state.roundState,
      narrowedChoices: [],
      repairTarget: null,
      selectedFunctionRowId: rowId,
    },
  }
}

function checkFunctionRow(state: GameSessionState, round: GameRound): GameSessionState {
  if (round.type !== 'protein' || !canEditRound(state) || !state.roundState.selectedFunctionRowId) return state
  const attempted = { ...state.roundState, attempts: state.roundState.attempts + 1 }
  return attempted.selectedFunctionRowId === round.correctRowId
    ? completeRound(state, round, attempted, attempted.selectedFunctionRowId)
    : recordMistake(state, round, attempted, attempted.selectedFunctionRowId)
}

function toggleHint(state: GameSessionState, round: GameRound): GameSessionState {
  if (!canEditRound(state)) return state
  const showHint = !state.roundState.showHint
  const next = showHint
    ? addSupportEvent(state.roundState, {
        action: round.context.action,
        affectsIndependence: true,
        attempt: state.roundState.attempts,
        choices: [],
        kind: 'explicit-hint',
        location: round.shortTitle,
        rule: round.hint,
      })
    : state.roundState
  return { ...state, roundState: { ...next, hintUsed: next.hintUsed || showHint, showHint } }
}

function openCodonWheel(state: GameSessionState, round: GameRound): GameSessionState {
  if (round.type !== 'translation' || !canEditRound(state) || state.isCodonWheelOpen) return state
  return {
    ...state,
    isCodonWheelOpen: true,
    roundState: addSupportEvent(state.roundState, {
      action: round.context.action,
      affectsIndependence: false,
      attempt: state.roundState.attempts,
      choices: [],
      kind: 'reference-wheel',
      location: `codon ${state.roundState.currentCodonIndex + 1}`,
      rule: 'Use the mRNA codon wheel from the center outward.',
    }),
  }
}

function recordMistake(state: GameSessionState, round: GameRound, attempted: RoundState, submitted: string): GameSessionState {
  const repairTarget = buildRepairTarget(round, submitted, attempted)
  const mistakeNumber = attempted.mistakes + 1
  const shouldNarrow = state.settings.supportMode === 'guided' || mistakeNumber >= 2
  const narrowedChoices = shouldNarrow ? getNarrowedChoices(round, repairTarget) : []
  const supportEvent: SupportEvent = {
    action: round.context.action,
    affectsIndependence: true,
    attempt: attempted.attempts,
    choices: narrowedChoices,
    kind: shouldNarrow ? 'narrowed-choices' : 'error-location-rule',
    location: repairTarget?.label ?? round.shortTitle,
    rule: diagnosticRule(round, repairTarget),
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
): GameSessionState {
  if (isCurrentRoundComplete(state)) return state
  const result = getRoundResult(round, state.currentRoundIndex, roundState, submitted, true)
  const completesSequence = round.type === 'protein'
  const completedProducts = round.type === 'protein'
    ? upsertProductSnapshot(state.completedProducts, createProductSnapshot(round))
    : state.completedProducts
  return {
    ...state,
    completedProducts,
    feedback: {
      detail: `Produced: ${getExpectedAnswer(round)}`,
      kind: 'success',
      message: completionMessage(round),
      title: completesSequence ? 'Protein product complete.' : `${round.shortTitle} complete.`,
    },
    isCodonWheelOpen: false,
    roundResults: upsertRoundResult(state.roundResults, result),
    roundState: { ...roundState, narrowedChoices: [], pendingTranslationChoice: '', repairTarget: null },
    saveStatus: 'saved-local',
    screen: completesSequence ? 'sequence-transition' : 'playing',
  }
}

function continueAfterSuccess(state: GameSessionState, now: number): GameSessionState {
  if (state.feedback?.kind !== 'success' || !isCurrentRoundComplete(state)) return state
  const rounds = state.runManifest.rounds
  if (state.currentRoundIndex === rounds.length - 1) {
    return finishRun(state, now)
  }
  const currentRoundIndex = state.currentRoundIndex + 1
  return {
    ...state,
    currentRoundIndex,
    feedback: null,
    roundState: createRoundState(rounds[currentRoundIndex]),
    saveStatus: 'local-draft',
    screen: 'playing',
  }
}

function submitTransfer(state: GameSessionState, answer: string, now: number): GameSessionState {
  if (state.screen !== 'transfer' || state.transferResults.length > 0) return state
  const task = state.transferTasks[state.currentTransferIndex]
  if (!task || !task.options.includes(answer)) return state
  const recovered = answer === task.expected
  const attempts = task.attempts + 1
  const submittedAnswers = [...task.submittedAnswers, answer]

  if (!recovered && attempts === 1) {
    const transferTasks = state.transferTasks.map((item, index) => index === state.currentTransferIndex
      ? { ...item, attempts, submittedAnswers }
      : item)
    return {
      ...state,
      feedback: {
        kind: 'error',
        title: 'Use the correction and repair your answer.',
        message: task.correctiveFeedback,
      },
      saveStatus: 'local-draft',
      transferTasks,
    }
  }

  const transferResults = [{
    attempts,
    correctiveFeedbackShown: task.attempts > 0,
    evidence: transferEvidence(task),
    expected: task.expected,
    outcome: recovered ? 'recovered' as const : 'not-yet-recovered' as const,
    recovered,
    skillLabel: task.skillLabel,
    sourceFamilyId: task.sourceFamilyId,
    submitted: answer,
    submittedAnswers,
    targetCategory: task.targetCategory,
    targetStage: task.targetStage,
    taskId: task.id,
  }]
  const recoveredConcepts = recovered && !state.recoveredConcepts.includes(task.targetCategory)
    ? [...state.recoveredConcepts, task.targetCategory]
    : state.recoveredConcepts
  return finishRun({ ...state, recoveredConcepts, transferResults }, now)
}

function transferEvidence(task: GameSessionState['transferTasks'][number]): string {
  if (task.stimulus.kind === 'transcription') return `DNA strand ${task.stimulus.dnaTemplate}`
  if (task.stimulus.kind === 'translation') return `mRNA codons ${task.stimulus.mrnaCodons.join(' ')}`
  return `amino-acid chain ${task.stimulus.aminoAcidChain.join('-')}`
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
  if (state.settings.replayMode === 'targeted') {
    const transferTasks = buildTransferTasks(state.runManifest, state.roundResults, `${state.attemptId}:targeted`).slice(0, 1)
    if (transferTasks.length > 0) {
      return {
        ...state,
        attemptId: createAttemptId(now),
        attemptKind: 'targeted-practice',
        completedAt: null,
        currentTransferIndex: 0,
        elapsedSeconds: 0,
        feedback: null,
        parentAttemptId: state.attemptId,
        replayChallenge: buildReplayChallenge(state),
        saveStatus: 'local-draft',
        screen: 'transfer',
        startedAt: now,
        transferResults: [],
        transferTasks,
      }
    }
  }
  const fresh = createInitialGameState(now)
  const runManifest = buildRunManifest(fresh.attemptId, [state.runManifest.familyId])
  return {
    ...fresh,
    identity: state.identity,
    replayChallenge: buildReplayChallenge(state),
    roundState: createRoundState(runManifest.rounds[0]),
    runManifest,
    screen: 'playing',
    settings: state.settings,
  }
}

function addSupportEvent(roundState: RoundState, event: SupportEvent): RoundState {
  const duplicate = roundState.supportEvents.some((item) => item.kind === event.kind && item.location === event.location)
  return duplicate ? roundState : { ...roundState, supportEvents: [...roundState.supportEvents, event] }
}

function buildRepairTarget(round: GameRound, submitted: string, state: RoundState): RepairTarget | null {
  if (round.type === 'transcription') {
    const index = Math.max(0, findFirstMismatch(submitted, round.answer))
    const expected = round.answer[index]
    const submittedBase = submitted[index] ?? 'blank'
    return {
      category: submittedBase === 'T' || expected === 'U' ? 'rna-uses-u' : 'rna-template-pairing',
      expected,
      index,
      kind: 'base',
      label: `position ${index + 1}: ${round.template[index]} pairs with ${expected}`,
      submitted: submittedBase,
    }
  }
  if (round.type === 'translation') {
    const index = state.currentCodonIndex
    const expected = round.answers[index]
    return {
      category: expected === 'Stop' ? 'stop-signal' : state.pendingTranslationChoice ? 'codon-lookup' : 'codon-grouping',
      expected,
      index,
      kind: 'codon',
      label: `codon ${index + 1}: ${round.codons[index]} codes for ${expected}`,
      submitted: state.pendingTranslationChoice || 'blank',
    }
  }
  return {
    category: 'protein-trait-model',
    expected: round.correctRowId,
    index: round.referenceRows.findIndex((row) => row.id === round.correctRowId),
    kind: 'function-row',
    label: 'match all four amino acids to one function row',
    submitted: state.selectedFunctionRowId || 'blank',
  }
}

function getNarrowedChoices(round: GameRound, target: RepairTarget | null): string[] {
  if (!target) return []
  if (round.type === 'transcription') return [target.expected, ...round.options.filter((item) => item !== target.expected).slice(0, 1)]
  if (round.type === 'translation') {
    return [target.expected, ...round.codonChoices[target.index].filter((item) => item !== target.expected).slice(0, 1)]
  }
  return [target.expected, ...round.referenceRows.map((row) => row.id).filter((id) => id !== target.expected).slice(0, 1)]
}

function diagnosticRule(round: GameRound, target: RepairTarget | null): string {
  if (round.type === 'transcription') {
    return `Pair a complementary RNA nucleotide with the DNA strand and use U, not T, at ${target?.label ?? 'the highlighted position'}.`
  }
  if (round.type === 'translation') {
    return target?.category === 'stop-signal'
      ? 'Stop ends translation and does not add an amino acid to the chain.'
      : `Read one complete mRNA codon at ${target?.label ?? 'the highlighted codon'}.`
  }
  return 'Match all four amino acids, then use the function and trait from that same row.'
}

function buildErrorFeedback(round: GameRound, state: RoundState, mistakeNumber: number): Feedback {
  return {
    detail: mistakeNumber >= 2 && state.narrowedChoices.length > 0
      ? `Choices narrowed to ${state.narrowedChoices.join(' or ')}.`
      : undefined,
    kind: 'error',
    message: diagnosticRule(round, state.repairTarget),
    title: mistakeNumber >= 2 ? 'Recalibrate the highlighted part.' : 'Inspect the highlighted mismatch.',
  }
}

function completionMessage(round: GameRound): string {
  if (round.type === 'transcription') return 'The completed mRNA strand is ready for translation.'
  if (round.type === 'translation') return 'Translation reached the stop codon. The four-amino-acid chain is ready for the function model.'
  return 'Compare this completed protein in the fictional model with the products already tested.'
}

function fallbackCategory(round: GameRound): MisconceptionCategory {
  if (round.type === 'transcription') return 'rna-template-pairing'
  if (round.type === 'translation') return 'codon-lookup'
  return 'protein-trait-model'
}

function buildReplayChallenge(state: GameSessionState): ReplayChallenge {
  const target = state.roundResults.find((result) => !result.independent)
  return target
    ? {
        baselineMistakes: target.mistakes,
        label: `Clear ${target.title} independently with a new family.`,
        roundId: target.id,
        roundTitle: target.title,
        type: target.hintUsed ? 'no-hint-round' : 'repair-round',
      }
    : { baselineMistakes: 0, label: 'Complete another precise nine-action run.', type: 'perfect-run' }
}

function createProductSnapshot(round: Extract<GameRound, { type: 'protein' }>): ProductSnapshot {
  const row = round.referenceRows.find((candidate) => candidate.id === round.correctRowId)
  if (!row) throw new Error(`Missing function row ${round.correctRowId}`)
  const labels = ['Original protein', 'Same-chain change', 'Changed-chain change'] as const
  return {
    aminoAcidChain: [...round.context.sequence.aminoAcidChain],
    dnaStrand: round.context.sequence.dnaStrand,
    expressedTrait: row.expressedTrait,
    functionRowId: row.id,
    label: labels[round.context.sequenceIndex],
    mrna: round.context.sequence.mrna,
    proteinFunction: row.proteinFunction,
    sequenceId: round.context.sequenceId,
    sequenceRole: round.context.sequenceRole,
    traitColor: row.traitColor,
  }
}

function upsertProductSnapshot(products: ProductSnapshot[], snapshot: ProductSnapshot): ProductSnapshot[] {
  const index = products.findIndex((product) => product.sequenceId === snapshot.sequenceId)
  if (index === -1) return [...products, snapshot]
  const next = [...products]
  next[index] = snapshot
  return next
}

function translationSubmission(state: RoundState, index: number): string {
  const submitted = [...state.answers]
  submitted[index] = state.pendingTranslationChoice
  return submitted.map((answer) => answer || 'blank').join('-')
}

function isTranscriptionReady(round: Extract<GameRound, { type: 'transcription' }>, input: string): boolean {
  if (input.length !== round.answer.length) return false
  const focus = selectVariantFocus(round)
  return !focus || round.options.some((base) => base === input[focus.changedMrnaIndex])
}

function firstOpenCodon(answers: string[]): number {
  const index = answers.findIndex((answer) => !answer)
  return index === -1 ? answers.length - 1 : index
}

function sameStrings(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index])
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
