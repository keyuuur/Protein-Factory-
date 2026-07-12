import { rounds, stationIdForRoundType } from '../content/rounds'
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
} from '../../types'

export type GameAction =
  | { type: 'START_GAME'; demoMode: boolean; firstName: string; period: string; now: number }
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
  | { type: 'REPLAY'; now: number }
  | { type: 'RESTART'; now: number }

export function createRoundState(round: GameRound): RoundState {
  return {
    input: '',
    answers: round.type === 'translation' ? new Array(round.codons.length).fill('') : [],
    currentCodonIndex: 0,
    attempts: 0,
    mistakes: 0,
    showHint: false,
    hintUsed: false,
    selectedProtein: '',
    selectedTrait: '',
    repairTarget: null,
  }
}

export function createInitialGameState(now = Date.now()): GameSessionState {
  return {
    attemptId: createAttemptId(now),
    screen: 'start',
    identity: {
      firstName: '',
      isDemo: false,
      period: '',
    },
    currentRoundIndex: 0,
    roundState: createRoundState(rounds[0]),
    feedback: null,
    roundResults: [],
    missedSkills: [],
    startedAt: now,
    completedAt: null,
    elapsedSeconds: 0,
    isCodonWheelOpen: false,
    taskDockOpen: false,
    selectedStationId: null,
    saveStatus: 'local-draft',
    replayChallenge: null,
  }
}

export function gameReducer(state: GameSessionState, action: GameAction): GameSessionState {
  const currentRound = rounds[state.currentRoundIndex]

  switch (action.type) {
    case 'START_GAME': {
      const trimmedName = action.firstName.trim()
      const firstName = action.demoMode ? 'Demo Student' : trimmedName

      if (!firstName || !action.period) {
        return state
      }

      return {
        ...createInitialGameState(action.now),
        identity: {
          firstName,
          isDemo: action.demoMode,
          period: action.period,
        },
        screen: 'tutorial',
      }
    }

    case 'START_ROUNDS':
      return {
        ...state,
        screen: 'intro',
        feedback: null,
      }

    case 'BEGIN_ROUND':
      if (state.screen !== 'intro') {
        return state
      }
      return {
        ...state,
        screen: 'playing',
        taskDockOpen: false,
        selectedStationId: null,
        feedback: buildStationPrompt(currentRound),
      }

    case 'SELECT_STATION':
      if (state.screen !== 'playing') {
        return state
      }
      return selectStation(state, action.stationId)

    case 'OPEN_ACTIVE_STATION':
      if (state.screen !== 'playing') {
        return state
      }
      return selectStation(state, stationIdForRoundType(currentRound.type))

    case 'CLOSE_TASK_DOCK':
      return {
        ...state,
        taskDockOpen: false,
        selectedStationId: null,
        isCodonWheelOpen: false,
      }

    case 'APPEND_BASE':
      if (!isBaseRound(currentRound) || !state.taskDockOpen) {
        return state
      }
      if (state.roundState.repairTarget?.kind === 'base') {
        const index = state.roundState.repairTarget.index
        if (index >= 0 && index < currentRound.answer.length) {
          const input = state.roundState.input.padEnd(currentRound.answer.length, '-')
          return {
            ...state,
            feedback: {
              kind: 'info',
              title: 'Repair placed.',
              message: 'Check the sequence when you are ready.',
            },
            roundState: {
              ...state.roundState,
              input: replaceAt(input, index, action.base).replaceAll('-', ''),
              repairTarget: null,
            },
          }
        }
      }
      if (state.roundState.input.length >= currentRound.answer.length) {
        return state
      }
      return {
        ...state,
        feedback: null,
        roundState: {
          ...state.roundState,
          input: state.roundState.input + action.base,
          repairTarget: null,
        },
      }

    case 'CLEAR_INPUT':
      return {
        ...state,
        feedback: null,
        roundState: {
          ...state.roundState,
          input: '',
          repairTarget: null,
        },
      }

    case 'BACKSPACE':
      return {
        ...state,
        feedback: null,
        roundState: {
          ...state.roundState,
          input: state.roundState.input.slice(0, -1),
          repairTarget: null,
        },
      }

    case 'CHECK_BASE_ROUND':
      return checkBaseRound(state, currentRound)

    case 'SELECT_TRANSLATION':
      return selectTranslation(state, currentRound, action.index, action.value)

    case 'GO_TO_TRANSLATION_CODON':
      return goToTranslationCodon(state, currentRound, action.index)

    case 'CHECK_TRANSLATION_CODON':
      return checkTranslationCodon(state, currentRound)

    case 'CHECK_FULL_TRANSLATION':
      return checkFullTranslation(state, currentRound)

    case 'SELECT_PROTEIN':
      return selectProtein(state, currentRound, action.option)

    case 'CHECK_PROTEIN':
      return checkProtein(state, currentRound)

    case 'TOGGLE_HINT': {
      const showHint = !state.roundState.showHint
      return {
        ...state,
        roundState: {
          ...state.roundState,
          showHint,
          hintUsed: state.roundState.hintUsed || showHint,
        },
      }
    }

    case 'OPEN_CODON_WHEEL':
      if (currentRound.type !== 'translation') {
        return {
          ...state,
          feedback: {
            kind: 'info',
            title: 'Codon Wheel locked.',
            message: 'Use the codon helper at the Ribosome Galley during translation rounds.',
          },
        }
      }
      return {
        ...state,
        isCodonWheelOpen: true,
      }

    case 'CLOSE_CODON_WHEEL':
      return {
        ...state,
        isCodonWheelOpen: false,
      }

    case 'CONTINUE_AFTER_SUCCESS':
      if (state.screen !== 'success') {
        return state
      }
      return continueAfterSuccess(state, action.now)

    case 'REPLAY':
      return {
        ...createInitialGameState(action.now),
        identity: state.identity,
        screen: 'intro',
        replayChallenge: buildReplayChallenge(state),
      }

    case 'RESTART':
      return {
        ...createInitialGameState(action.now),
        identity: {
          firstName: '',
          isDemo: false,
          period: state.identity.period,
        },
        replayChallenge: null,
      }

    default:
      return state
  }
}

export function formatChain(state: RoundState): string {
  return state.answers.filter(Boolean).join('-') || 'not started'
}

export function selectActiveStationId(state: GameSessionState): StationId {
  return stationIdForRoundType(rounds[state.currentRoundIndex].type)
}

export function selectCompletedStationIds(state: GameSessionState): StationId[] {
  const completedTypes = new Set(state.roundResults.filter((result) => result.correct).map((result) => result.type))
  return [...completedTypes].map((type) => stationIdForRoundType(type))
}

export function selectReplayChallengeStatus(state: GameSessionState): string {
  return state.replayChallenge?.label ?? ''
}

function selectStation(state: GameSessionState, stationId: StationId): GameSessionState {
  const currentRound = rounds[state.currentRoundIndex]
  const activeStationId = stationIdForRoundType(currentRound.type)

  if (stationId !== activeStationId) {
    return {
      ...state,
      selectedStationId: activeStationId,
      taskDockOpen: false,
      feedback: {
        kind: 'info',
        title: `Go to ${stationLabel(activeStationId)}.`,
        message: `This step uses ${currentRound.shortTitle}. Open the highlighted station.`,
      },
    }
  }

  return {
    ...state,
    selectedStationId: stationId,
    taskDockOpen: true,
    feedback: {
      kind: 'info',
      title: stationLabel(stationId),
      message: 'Task ready. Complete this factory step.',
    },
  }
}

function checkBaseRound(state: GameSessionState, round: GameRound): GameSessionState {
  if (!isBaseRound(round) || !state.taskDockOpen) {
    return state
  }

  const attemptedState = {
    ...state.roundState,
    attempts: state.roundState.attempts + 1,
  }

  if (state.roundState.input.length < round.answer.length) {
    return {
      ...state,
      feedback: {
        kind: 'info',
        title: 'Finish the sequence.',
        message: `Add ${round.answer.length - state.roundState.input.length} more base${round.answer.length - state.roundState.input.length === 1 ? '' : 's'} before checking.`,
      },
    }
  }

  const isCorrect = attemptedState.input === round.answer

  if (!isCorrect) {
    return recordMistake(state, round, attemptedState, attemptedState.input)
  }

  return completeRound(state, round, attemptedState, attemptedState.input)
}

function selectTranslation(
  state: GameSessionState,
  round: GameRound,
  index: number,
  value: string,
): GameSessionState {
  if (round.type !== 'translation' || !state.taskDockOpen) {
    return state
  }

  const nextAnswers = [...state.roundState.answers]
  nextAnswers[index] = value
  const repairingThisCodon =
    state.roundState.repairTarget?.kind === 'codon' && state.roundState.repairTarget.index === index
  const nextActiveIndex =
    round.mode === 'full' ? getNextFullTranslationIndex(nextAnswers, index, round.answers.length) : state.roundState.currentCodonIndex
  const selectedState = {
    ...state.roundState,
    answers: nextAnswers,
    currentCodonIndex: nextActiveIndex,
    repairTarget: repairingThisCodon ? null : state.roundState.repairTarget,
  }

  if (round.mode === 'full') {
    return {
      ...state,
      roundState: selectedState,
      feedback: {
        kind: 'info',
        title: repairingThisCodon ? 'Repair placed.' : 'Cargo loaded.',
        message: nextAnswers.every(Boolean)
          ? 'Every codon has cargo. Check the full sequence.'
          : 'Keep loading amino acid cargo one codon at a time.',
      },
    }
  }

  return {
    ...state,
    roundState: selectedState,
    feedback: {
      kind: 'info',
      title: repairingThisCodon ? 'Repair placed.' : 'Choice selected.',
      message: 'Check the codon when you are ready.',
    },
  }
}

function goToTranslationCodon(state: GameSessionState, round: GameRound, index: number): GameSessionState {
  if (round.type !== 'translation' || !state.taskDockOpen) {
    return state
  }

  if (index < 0 || index >= round.codons.length) {
    return state
  }

  return {
    ...state,
    roundState: {
      ...state.roundState,
      currentCodonIndex: index,
    },
  }
}

function checkTranslationCodon(state: GameSessionState, round: GameRound): GameSessionState {
  if (round.type !== 'translation' || round.mode !== 'perCodon' || !state.taskDockOpen) {
    return state
  }

  const index = state.roundState.currentCodonIndex
  const selected = state.roundState.answers[index]

  if (!selected) {
    return {
      ...state,
      feedback: {
        kind: 'info',
        title: 'Choose an amino acid.',
        message: `Pick the amino acid for ${round.codons[index]}, then check it.`,
      },
    }
  }

  const attemptedState = {
    ...state.roundState,
    attempts: state.roundState.attempts + 1,
  }
  const expected = round.answers[index]

  if (selected !== expected) {
    return recordMistake(state, round, attemptedState, attemptedState.answers.filter(Boolean).join('-'))
  }

  if (index < round.answers.length - 1) {
    return {
      ...state,
      roundState: {
        ...attemptedState,
        currentCodonIndex: index + 1,
        repairTarget: null,
      },
      feedback: {
        kind: 'success',
        title: 'Codon translated.',
        message: 'Factory conveyor advanced to the next codon.',
      },
    }
  }

  return completeRound(state, round, attemptedState, attemptedState.answers.join('-'))
}

function checkFullTranslation(state: GameSessionState, round: GameRound): GameSessionState {
  if (round.type !== 'translation' || round.mode !== 'full' || !state.taskDockOpen) {
    return state
  }

  const attemptedState = {
    ...state.roundState,
    attempts: state.roundState.attempts + 1,
  }
  const hasAllAnswers = attemptedState.answers.every(Boolean)

  if (!hasAllAnswers) {
    return {
      ...state,
      feedback: {
        kind: 'info',
        title: 'Finish every codon.',
        message: 'Select one amino acid for each codon before checking the chain.',
      },
    }
  }

  const isCorrect =
    hasAllAnswers && attemptedState.answers.every((answer, index) => answer === round.answers[index])
  const submitted = attemptedState.answers.filter(Boolean).join('-')

  if (!isCorrect) {
    return recordMistake(state, round, attemptedState, submitted)
  }

  return completeRound(state, round, attemptedState, attemptedState.answers.join('-'))
}

function selectProtein(state: GameSessionState, round: GameRound, option: ProteinOption): GameSessionState {
  if (round.type !== 'protein' || !state.taskDockOpen) {
    return state
  }

  return {
    ...state,
    roundState: {
      ...state.roundState,
      selectedProtein: option.protein,
      selectedTrait: option.trait,
      repairTarget: state.roundState.repairTarget?.kind === 'protein' ? null : state.roundState.repairTarget,
    },
    feedback: {
      kind: 'info',
      title: 'Trait selected.',
      message: 'Check the trait when you are ready.',
    },
  }
}

function checkProtein(state: GameSessionState, round: GameRound): GameSessionState {
  if (round.type !== 'protein' || !state.taskDockOpen) {
    return state
  }

  if (!state.roundState.selectedTrait) {
    return {
      ...state,
      feedback: {
        kind: 'info',
        title: 'Choose a trait.',
        message: 'Select the protein and trait match before checking.',
      },
    }
  }

  const attemptedState = {
    ...state.roundState,
    attempts: state.roundState.attempts + 1,
  }
  const isCorrect = state.roundState.selectedTrait === round.correctTrait

  if (!isCorrect) {
    return recordMistake(state, round, attemptedState, state.roundState.selectedTrait)
  }

  return completeRound(
    state,
    round,
    attemptedState,
    state.roundState.selectedTrait,
    state.roundState.selectedProtein,
    state.roundState.selectedTrait,
  )
}

function recordMistake(
  state: GameSessionState,
  round: GameRound,
  attemptedState: RoundState,
  submitted: string,
): GameSessionState {
  const repairTarget = buildRepairTarget(round, submitted, attemptedState)
  const errorState = {
    ...attemptedState,
    mistakes: attemptedState.mistakes + 1,
    repairTarget,
    currentCodonIndex: repairTarget?.kind === 'codon' ? repairTarget.index : attemptedState.currentCodonIndex,
  }
  const category = repairTarget?.category ?? getFallbackCategory(round)

  return {
    ...state,
    roundState: errorState,
    missedSkills: [
      ...state.missedSkills,
      createMissedSkill(round, state.currentRoundIndex, errorState, submitted, 'mistake', category),
    ],
    feedback: buildErrorFeedback(round, submitted, errorState),
  }
}

function completeRound(
  state: GameSessionState,
  round: GameRound,
  attemptedState: RoundState,
  submitted: string,
  selectedProtein = '',
  selectedTrait = '',
): GameSessionState {
  const result = getRoundResult(
    round,
    state.currentRoundIndex,
    attemptedState,
    submitted,
    true,
    selectedProtein,
    selectedTrait,
  )

  return {
    ...state,
    roundState: {
      ...attemptedState,
      repairTarget: null,
    },
    roundResults: upsertRoundResult(state.roundResults, result),
    feedback: buildSuccessFeedback(round),
    screen: 'success',
    taskDockOpen: false,
    selectedStationId: null,
    isCodonWheelOpen: false,
    saveStatus: 'saved-local',
  }
}

function continueAfterSuccess(state: GameSessionState, now: number): GameSessionState {
  if (state.currentRoundIndex >= rounds.length - 1) {
    return {
      ...state,
      screen: 'end',
      completedAt: now,
      elapsedSeconds: Math.max(1, Math.round((now - state.startedAt) / 1000)),
      feedback: null,
      saveStatus: 'saved-local',
    }
  }

  const nextRoundIndex = state.currentRoundIndex + 1
  const nextRound = rounds[nextRoundIndex]
  const nextStationId = stationIdForRoundType(nextRound.type)

  return {
    ...state,
    currentRoundIndex: nextRoundIndex,
    roundState: createRoundState(nextRound),
    feedback: {
      kind: 'info',
      title: `${stationLabel(nextStationId)} ready.`,
      message: nextRound.prompt,
    },
    screen: 'playing',
    taskDockOpen: true,
    selectedStationId: nextStationId,
    saveStatus: 'local-draft',
  }
}

function buildStationPrompt(round: GameRound): Feedback {
  return {
    kind: 'info',
    title: stationLabel(stationIdForRoundType(round.type)),
    message: 'Tap the highlighted station to begin.',
  }
}

function buildSuccessFeedback(round: GameRound): Feedback {
  const action =
    round.type === 'protein'
      ? 'Trait shipped.'
      : round.type === 'translation'
        ? 'Amino acid chain advanced.'
        : 'Sequence completed.'

  return {
    kind: 'success',
    title: action,
    message: buildShipmentMessage(round),
    detail: `${round.type === 'translation' ? 'Amino acid chain' : 'Expected'}: ${getExpectedAnswer(round)}`,
  }
}

function buildErrorFeedback(round: GameRound, submitted: string, state: RoundState): Feedback {
  const message = buildDiagnosticMessage(round, submitted, state)

  return {
    kind: 'error',
    title: getErrorTitle(round),
    message,
    detail: state.repairTarget
      ? `Submitted: ${submitted || 'nothing yet'}. Repair the highlighted ${state.repairTarget.kind === 'codon' ? 'codon' : 'tile'}.`
      : `Submitted: ${submitted || 'nothing yet'}.`,
  }
}

function getErrorTitle(round: GameRound): string {
  if (round.type === 'dna') {
    return 'Check DNA pairing.'
  }

  if (round.type === 'transcription') {
    return 'Check mRNA pairing.'
  }

  if (round.type === 'translation') {
    return 'Check codon translation.'
  }

  return 'Check model trait match.'
}

function buildDiagnosticMessage(round: GameRound, submitted: string, state: RoundState): string {
  if (state.repairTarget) {
    return state.repairTarget.label
  }

  if (isBaseRound(round)) {
    const missingCount = round.answer.length - submitted.length
    if (missingCount > 0) {
      return `This needs ${round.answer.length} bases. Add ${missingCount} more before checking.`
    }

    const mismatch = findFirstMismatch(submitted, round.answer)
    if (mismatch !== -1) {
      const templateBase = round.template[mismatch]
      const expectedBase = round.answer[mismatch]
      const submittedBase = submitted[mismatch] ?? 'blank'
      const molecule = round.type === 'transcription' ? 'mRNA' : 'DNA'
      return `Position ${mismatch + 1}: template ${templateBase} pairs with ${expectedBase} in ${molecule}, not ${submittedBase}.`
    }
  }

  if (round.type === 'translation') {
    const mismatch = round.answers.findIndex((answer, index) => state.answers[index] && state.answers[index] !== answer)
    if (mismatch !== -1) {
      return `${round.codons[mismatch]} codes for ${round.answers[mismatch]}, not ${state.answers[mismatch]}.`
    }

    const missing = round.answers.findIndex((_, index) => !state.answers[index])
    if (missing !== -1) {
      return `Codon ${missing + 1} still needs an amino acid before the chain can ship.`
    }
  }

  if (round.type === 'protein') {
    return `${state.selectedProtein || 'That choice'} does not match the short ${round.chain} model. In this game model, the matching trait is ${round.correctTrait}.`
  }

  return 'Check the model, then repair this factory step.'
}

function buildShipmentMessage(round: GameRound): string {
  if (round.type === 'dna') {
    return `DNA copy shipped: ${round.answer}.`
  }

  if (round.type === 'transcription') {
    return `mRNA message printed: ${round.answer}.`
  }

  if (round.type === 'translation') {
    return `Amino acid chain shipped: ${round.answers.join('-')}.`
  }

  if (round.type === 'protein') {
    return `Model trait shipped: ${round.correctTrait}.`
  }

  return 'Factory step shipped.'
}

function findFirstMismatch(submitted: string, expected: string): number {
  for (let index = 0; index < expected.length; index += 1) {
    if (submitted[index] !== expected[index]) {
      return index
    }
  }

  return -1
}

function buildRepairTarget(round: GameRound, submitted: string, state: RoundState): RepairTarget | null {
  if (isBaseRound(round)) {
    const mismatch = findFirstMismatch(submitted, round.answer)
    const repairIndex = mismatch === -1 ? 0 : mismatch
    const expected = round.answer[repairIndex] ?? ''
    const submittedBase = submitted[repairIndex] ?? 'blank'
    const templateBase = round.template[repairIndex] ?? 'blank'
    const category = getBaseCategory(round, submittedBase, expected)
    const molecule = round.type === 'transcription' ? 'mRNA' : 'DNA'

    return {
      kind: 'base',
      index: repairIndex,
      expected,
      submitted: submittedBase,
      category,
      label: `Fix position ${repairIndex + 1}: template ${templateBase} pairs with ${expected} in ${molecule}, not ${submittedBase}.`,
    }
  }

  if (round.type === 'translation') {
    const mismatch = round.answers.findIndex((answer, index) => state.answers[index] && state.answers[index] !== answer)
    const missing = round.answers.findIndex((_, index) => !state.answers[index])
    const repairIndex = mismatch !== -1 ? mismatch : Math.max(0, missing)
    const expected = round.answers[repairIndex] ?? ''
    const submittedAnswer = state.answers[repairIndex] || 'blank'

    return {
      kind: 'codon',
      index: repairIndex,
      expected,
      submitted: submittedAnswer,
      category: missing !== -1 && mismatch === -1 ? 'codon-grouping' : 'codon-lookup',
      label: `Fix codon ${repairIndex + 1}: ${round.codons[repairIndex]} codes for ${expected}, not ${submittedAnswer}.`,
    }
  }

  if (round.type === 'protein') {
    return {
      kind: 'protein',
      index: 0,
      expected: round.correctTrait,
      submitted: state.selectedTrait || submitted || 'blank',
      category: 'protein-trait-model',
      label: `Fix the model match: the short ${round.chain} clue matches ${round.correctTrait}.`,
    }
  }

  return null
}

function getBaseCategory(round: Extract<GameRound, { type: 'dna' | 'transcription' }>, submitted: string, expected: string): MisconceptionCategory {
  if (round.type === 'transcription') {
    return submitted === 'T' || expected === 'U' ? 'rna-uses-u' : 'rna-template-pairing'
  }

  return 'dna-base-pairing'
}

function getFallbackCategory(round: GameRound): MisconceptionCategory {
  if (round.type === 'dna') return 'dna-base-pairing'
  if (round.type === 'transcription') return 'rna-template-pairing'
  if (round.type === 'translation') return 'codon-lookup'
  return 'protein-trait-model'
}

function getNextFullTranslationIndex(answers: string[], selectedIndex: number, length: number): number {
  const nextMissing = answers.findIndex((answer, index) => index > selectedIndex && !answer)
  if (nextMissing !== -1) {
    return nextMissing
  }

  const firstMissing = answers.findIndex((answer) => !answer)
  if (firstMissing !== -1) {
    return firstMissing
  }

  return Math.min(selectedIndex, length - 1)
}

function replaceAt(input: string, index: number, value: string): string {
  return `${input.slice(0, index)}${value}${input.slice(index + 1)}`
}

function createAttemptId(now: number): string {
  const uuid = globalThis.crypto?.randomUUID?.()
  return uuid ? `ppf-${uuid}` : `ppf-${now}-${Math.random().toString(36).slice(2, 8)}`
}

function buildReplayChallenge(state: GameSessionState): ReplayChallenge {
  const hintedRound = state.roundResults.find((result) => result.hintUsed)
  if (hintedRound) {
    return {
      type: 'no-hint-round',
      roundId: hintedRound.id,
      roundTitle: hintedRound.title,
      baselineMistakes: hintedRound.mistakes,
      label: `Replay challenge: clear ${hintedRound.title} without a hint.`,
    }
  }

  const repairedRound = state.roundResults.find((result) => result.mistakes > 0)
  if (repairedRound) {
    return {
      type: 'repair-round',
      roundId: repairedRound.id,
      roundTitle: repairedRound.title,
      baselineMistakes: repairedRound.mistakes,
      label: `Replay challenge: fewer repairs on ${repairedRound.title}.`,
    }
  }

  return {
    type: 'perfect-run',
    baselineMistakes: 0,
    label: 'Replay challenge: finish a perfect run again.',
  }
}

function isBaseRound(round: GameRound): round is Extract<GameRound, { type: 'dna' | 'transcription' }> {
  return round.type === 'dna' || round.type === 'transcription'
}

function stationLabel(stationId: StationId): string {
  switch (stationId) {
    case 'dna-dock':
      return 'DNA Dock'
    case 'transcription-press':
      return 'Transcription Press'
    case 'ribosome-galley':
      return 'Ribosome Galley'
    case 'trait-vault':
      return 'Trait Vault'
  }
}
