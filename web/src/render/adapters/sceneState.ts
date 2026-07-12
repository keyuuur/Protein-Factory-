import { rounds, stationForRoundType, stationIdForRoundType } from '../../game/content/rounds'
import { selectCompletedStationIds } from '../../game/simulation/gameReducer'
import type { FactorySceneState, GameSessionState } from '../../types'

export function buildFactorySceneState(state: GameSessionState): FactorySceneState {
  const activeStationId = stationIdForRoundType(rounds[state.currentRoundIndex].type)
  const currentRound = rounds[state.currentRoundIndex]
  const activeStation = stationForRoundType(currentRound.type)

  return {
    activeStationId,
    selectedStationId: state.selectedStationId,
    completedStationIds: selectCompletedStationIds(state),
    inputLocked: state.taskDockOpen || state.isCodonWheelOpen || state.screen !== 'playing',
    progress: state.roundResults.length / rounds.length,
    cargoLabel: getCargoLabel(state),
    statusKind: state.feedback?.kind ?? 'info',
    repairActive: Boolean(state.roundState.repairTarget),
    activeStationLabel: activeStation.shortTitle,
  }
}

function getCargoLabel(state: GameSessionState): string {
  const currentRound = rounds[state.currentRoundIndex]

  if (currentRound.type === 'dna' || currentRound.type === 'transcription') {
    return state.roundState.input || currentRound.template
  }

  if (currentRound.type === 'translation') {
    return state.roundState.answers.filter(Boolean).join('-') || currentRound.codons[state.roundState.currentCodonIndex]
  }

  if (currentRound.type === 'protein') {
    return state.roundState.selectedTrait || currentRound.chain
  }

  return currentRound.shortTitle
}
