import { defaultRunManifest, stationForRoundType, stationIdForRoundType } from '../../game/content/rounds'
import { selectCompletedStationIds } from '../../game/simulation/gameReducer'
import type { FactorySceneState, GameRound, GameSessionState, ProteinRound, StationId } from '../../types'

export type LabCargoKind = 'dna' | 'mrna' | 'amino-acids' | 'protein-test'

export interface ProteinComparison {
  normalLabel: string
  variantLabel: string
  selectedLabel: string
  traitLabel: string
  pigmentActive: boolean
}

export interface FactorySceneSnapshot extends FactorySceneState {
  cargoKind: LabCargoKind
  templateSequence: string
  productSequence: string
  codons: string[]
  aminoAcids: string[]
  proteinComparison: ProteinComparison | null
  stageComplete: boolean
}

export function buildFactorySceneState(state: GameSessionState): FactorySceneSnapshot {
  const rounds = state.runManifest.rounds
  const currentRound = rounds[state.currentRoundIndex]
  const activeStationId = stationIdForRoundType(currentRound.type)
  const activeStation = stationForRoundType(currentRound.type)
  const cargo = getCargoSnapshot(currentRound, state)

  return {
    activeStationId,
    selectedStationId: state.selectedStationId,
    completedStationIds: selectCompletedStationIds(state),
    inputLocked: state.isCodonWheelOpen || state.screen !== 'playing',
    progress: state.roundResults.length / rounds.length,
    cargoLabel: cargo.productSequence || cargo.templateSequence || activeStation.shortTitle,
    statusKind: state.feedback?.kind ?? 'info',
    repairActive: Boolean(state.roundState.repairTarget),
    activeStationLabel: labStationLabel(activeStationId),
    ...cargo,
    stageComplete: state.screen === 'success' || state.screen === 'end',
  }
}

export function buildSuccessSceneState(round: GameRound): FactorySceneSnapshot {
  const activeStationId = stationIdForRoundType(round.type)
  const cargo = getCompletedCargoSnapshot(round)

  return {
    activeStationId,
    selectedStationId: activeStationId,
    completedStationIds: [activeStationId],
    inputLocked: true,
    progress: 1,
    cargoLabel: cargo.productSequence || cargo.templateSequence,
    statusKind: 'success',
    repairActive: false,
    activeStationLabel: labStationLabel(activeStationId),
    ...cargo,
    stageComplete: true,
  }
}

export function buildFinalSceneState(): FactorySceneSnapshot {
  const finalRound = defaultRunManifest.rounds[defaultRunManifest.rounds.length - 1]
  const snapshot = buildSuccessSceneState(finalRound)
  return {
    ...snapshot,
    completedStationIds: ['dna-dock', 'transcription-press', 'ribosome-galley', 'trait-vault'],
    activeStationId: 'trait-vault',
    selectedStationId: 'trait-vault',
    activeStationLabel: 'Function Test Chamber',
  }
}

function getCargoSnapshot(
  round: GameRound,
  state: GameSessionState,
): Pick<
  FactorySceneSnapshot,
  'cargoKind' | 'templateSequence' | 'productSequence' | 'codons' | 'aminoAcids' | 'proteinComparison'
> {
  if (round.type === 'dna') {
    return {
      cargoKind: 'dna',
      templateSequence: round.template,
      productSequence: state.roundState.input,
      codons: [],
      aminoAcids: [],
      proteinComparison: null,
    }
  }

  if (round.type === 'transcription') {
    return {
      cargoKind: 'mrna',
      templateSequence: round.template,
      productSequence: state.roundState.input,
      codons: [],
      aminoAcids: [],
      proteinComparison: null,
    }
  }

  if (round.type === 'translation') {
    return {
      cargoKind: 'amino-acids',
      templateSequence: round.codons.join(' '),
      productSequence: state.roundState.answers.filter(Boolean).join('-'),
      codons: round.codons,
      aminoAcids: state.roundState.answers,
      proteinComparison: null,
    }
  }

  if (isProteinRound(round)) {
    return {
      cargoKind: 'protein-test',
      templateSequence: round.chain,
      productSequence: state.roundState.selectedTrait,
      codons: [],
      aminoAcids: round.chain.split('-'),
      proteinComparison: buildProteinComparison(round, state.roundState.selectedProtein, state.roundState.selectedTrait),
    }
  }

  return emptyCargo()
}

function getCompletedCargoSnapshot(
  round: GameRound,
): Pick<
  FactorySceneSnapshot,
  'cargoKind' | 'templateSequence' | 'productSequence' | 'codons' | 'aminoAcids' | 'proteinComparison'
> {
  if (round.type === 'dna') {
    return {
      cargoKind: 'dna',
      templateSequence: round.template,
      productSequence: round.answer,
      codons: [],
      aminoAcids: [],
      proteinComparison: null,
    }
  }

  if (round.type === 'transcription') {
    return {
      cargoKind: 'mrna',
      templateSequence: round.template,
      productSequence: round.answer,
      codons: [],
      aminoAcids: [],
      proteinComparison: null,
    }
  }

  if (round.type === 'translation') {
    return {
      cargoKind: 'amino-acids',
      templateSequence: round.codons.join(' '),
      productSequence: round.answers.join('-'),
      codons: round.codons,
      aminoAcids: round.answers,
      proteinComparison: null,
    }
  }

  if (!isProteinRound(round)) return emptyCargo()

  const correct = round.options.find((option) => option.trait === round.correctTrait) ?? round.options[0]
  return {
    cargoKind: 'protein-test',
    templateSequence: round.chain,
    productSequence: round.correctTrait,
    codons: [],
    aminoAcids: round.chain.split('-'),
    proteinComparison: buildProteinComparison(round, correct?.protein ?? '', round.correctTrait),
  }
}

function buildProteinComparison(
  round: ProteinRound,
  selectedProtein: string,
  selectedTrait: string,
): ProteinComparison {
  const normal = round.options.find((option) => !/altered|variant/i.test(option.protein)) ?? round.options[0]
  const variant = round.options.find((option) => /altered|variant/i.test(option.protein)) ?? round.options[1] ?? round.options[0]

  return {
    normalLabel: normal?.protein ?? 'Normal protein',
    variantLabel: variant?.protein ?? 'Variant protein',
    selectedLabel: selectedProtein,
    traitLabel: selectedTrait,
    pigmentActive: /melanin|pigment/i.test(selectedTrait),
  }
}

function isProteinRound(round: GameRound): round is ProteinRound {
  return 'chain' in round && 'correctTrait' in round
}

function emptyCargo(): Pick<FactorySceneSnapshot, 'cargoKind' | 'templateSequence' | 'productSequence' | 'codons' | 'aminoAcids' | 'proteinComparison'> {
  return { cargoKind: 'dna', templateSequence: '', productSequence: '', codons: [], aminoAcids: [], proteinComparison: null }
}

function labStationLabel(stationId: StationId): string {
  switch (stationId) {
    case 'dna-dock':
      return 'DNA Assembly Bench'
    case 'transcription-press':
      return 'Transcription Press'
    case 'ribosome-galley':
      return 'Ribosome Line'
    case 'trait-vault':
      return 'Function Test Chamber'
  }
}
