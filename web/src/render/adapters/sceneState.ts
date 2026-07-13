import { defaultRunManifest, stationIdForRoundType } from '../../game/content/rounds'
import type {
  FactorySceneState,
  FunctionReferenceRow,
  GameRound,
  GameSessionState,
  ProductSnapshot,
  ProductionAction,
  ProteinRound,
  RepairTarget,
  StationId,
} from '../../types'

export interface FunctionSelection {
  rowId: string
  proteinFunction: string
  expressedTrait: string
  traitColor: FunctionReferenceRow['traitColor']
}

export interface FactorySceneSnapshot extends FactorySceneState {
  codons: string[]
  currentCodonIndex: number
  repairTarget: RepairTarget | null
  selectedFunction: FunctionSelection | null
  feedbackTitle: string
  feedbackMessage: string
  stageComplete: boolean
}

export function buildFactorySceneState(state: GameSessionState): FactorySceneSnapshot {
  const rounds = state.runManifest.rounds
  const currentRound = rounds[state.currentRoundIndex] ?? rounds[0]
  const { action, sequence, sequenceIndex } = currentRound.context
  const selectedFunction = getSelectedFunction(currentRound, state.roundState.selectedFunctionRowId)
  const stageComplete = state.roundResults.some((result) => result.id === currentRound.id)

  return {
    activeStationId: stationIdForRoundType(currentRound.type),
    completedStationIds: completedStations(state),
    inputLocked: state.isCodonWheelOpen || state.screen !== 'playing',
    progress: rounds.length > 0 ? Math.min(1, state.roundResults.length / rounds.length) : 0,
    sequenceIndex,
    activeAction: action,
    cargoLabel: cargoLabel(action, sequenceIndex),
    statusKind: state.feedback?.kind ?? (state.screen === 'sequence-transition' ? 'success' : 'info'),
    repairActive: state.roundState.repairTarget !== null,
    activeStationLabel: actionLabel(action),
    dnaStrand: sequence.dnaStrand,
    mrna: action === 'transcription' ? state.roundState.input : sequence.mrna,
    aminoAcidChain: currentAminoAcids(currentRound, state),
    selectedFunctionRowId: state.roundState.selectedFunctionRowId,
    completedProducts: state.completedProducts,
    transitionActive: state.screen === 'sequence-transition',
    codons: [...sequence.mrnaCodons],
    currentCodonIndex: state.roundState.currentCodonIndex,
    repairTarget: state.roundState.repairTarget,
    selectedFunction,
    feedbackTitle: state.feedback?.title ?? '',
    feedbackMessage: state.feedback?.message ?? '',
    stageComplete,
  }
}

export function buildSuccessSceneState(round: GameRound): FactorySceneSnapshot {
  const { action, sequence, sequenceIndex } = round.context
  const selectedFunction = round.type === 'protein'
    ? getSelectedFunction(round, round.correctRowId)
    : null
  const completedProducts = round.type === 'protein' && selectedFunction
    ? [productFromRound(round, selectedFunction)]
    : []

  return {
    activeStationId: stationIdForRoundType(round.type),
    completedStationIds: [stationIdForRoundType(round.type)],
    inputLocked: true,
    progress: 1,
    sequenceIndex,
    activeAction: action,
    cargoLabel: cargoLabel(action, sequenceIndex),
    statusKind: 'success',
    repairActive: false,
    activeStationLabel: actionLabel(action),
    dnaStrand: sequence.dnaStrand,
    mrna: sequence.mrna,
    aminoAcidChain: [...sequence.aminoAcidChain],
    selectedFunctionRowId: selectedFunction?.rowId ?? '',
    completedProducts,
    transitionActive: action === 'function-test',
    codons: [...sequence.mrnaCodons],
    currentCodonIndex: 4,
    repairTarget: null,
    selectedFunction,
    feedbackTitle: 'Action complete',
    feedbackMessage: 'Cargo is ready for the next production action.',
    stageComplete: true,
  }
}

export function buildFinalSceneState(completedProducts: ProductSnapshot[] = defaultProducts()): FactorySceneSnapshot {
  const finalRound = defaultRunManifest.rounds[defaultRunManifest.rounds.length - 1]
  const snapshot = buildSuccessSceneState(finalRound)
  const lastProduct = completedProducts[completedProducts.length - 1]

  return {
    ...snapshot,
    activeStationId: 'trait-vault',
    completedStationIds: ['transcription-press', 'ribosome-galley', 'trait-vault'],
    activeStationLabel: 'Function Test',
    cargoLabel: 'Three completed protein products',
    completedProducts,
    selectedFunctionRowId: lastProduct?.functionRowId ?? snapshot.selectedFunctionRowId,
    selectedFunction: lastProduct ? selectionFromProduct(lastProduct) : snapshot.selectedFunction,
    feedbackTitle: 'Production run complete',
    feedbackMessage: 'Compare the original protein with both one-base variants.',
    transitionActive: false,
  }
}

function currentAminoAcids(round: GameRound, state: GameSessionState): string[] {
  if (round.type === 'transcription') return []
  if (round.type === 'protein') return [...round.context.sequence.aminoAcidChain]
  return state.roundState.answers.slice(0, 4)
}

function completedStations(state: GameSessionState): StationId[] {
  return [...new Set(
    state.roundResults
      .filter((result) => result.correct)
      .map((result) => stationIdForRoundType(result.type)),
  )]
}

function getSelectedFunction(round: GameRound, rowId: string): FunctionSelection | null {
  if (round.type !== 'protein' || !rowId) return null
  const row = round.referenceRows.find((candidate) => candidate.id === rowId)
  return row ? selectionFromRow(row) : null
}

function selectionFromRow(row: FunctionReferenceRow): FunctionSelection {
  return {
    rowId: row.id,
    proteinFunction: row.proteinFunction,
    expressedTrait: row.expressedTrait,
    traitColor: row.traitColor,
  }
}

function selectionFromProduct(product: ProductSnapshot): FunctionSelection {
  return {
    rowId: product.functionRowId,
    proteinFunction: product.proteinFunction,
    expressedTrait: product.expressedTrait,
    traitColor: product.traitColor,
  }
}

function productFromRound(round: ProteinRound, selection: FunctionSelection): ProductSnapshot {
  const sequence = round.context.sequence
  return {
    sequenceId: sequence.id,
    sequenceRole: sequence.role,
    label: sequenceLabel(round.context.sequenceIndex),
    dnaStrand: sequence.dnaStrand,
    mrna: sequence.mrna,
    aminoAcidChain: [...sequence.aminoAcidChain],
    functionRowId: selection.rowId,
    proteinFunction: selection.proteinFunction,
    expressedTrait: selection.expressedTrait,
    traitColor: selection.traitColor,
  }
}

function defaultProducts(): ProductSnapshot[] {
  return defaultRunManifest.rounds
    .filter((round): round is ProteinRound => round.type === 'protein')
    .map((round) => {
      const row = round.referenceRows.find((candidate) => candidate.id === round.correctRowId) ?? round.referenceRows[0]
      return productFromRound(round, selectionFromRow(row))
    })
}

function cargoLabel(action: ProductionAction, sequenceIndex: number): string {
  return `${sequenceLabel(sequenceIndex)} ${actionLabel(action)}`
}

function sequenceLabel(sequenceIndex: number): string {
  if (sequenceIndex === 0) return 'Original protein'
  if (sequenceIndex === 1) return 'Change A'
  return 'Change B'
}

function actionLabel(action: ProductionAction): string {
  if (action === 'transcription') return 'Transcription'
  if (action === 'translation') return 'Translation'
  return 'Function Test'
}
