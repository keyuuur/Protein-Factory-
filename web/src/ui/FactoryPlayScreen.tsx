import { Anchor } from 'lucide-react'
import { useCallback, useMemo } from 'react'
import { rounds, stationDefinitions, stationForRoundType } from '../game/content/rounds'
import type { GameAction } from '../game/simulation/gameReducer'
import { selectActiveStationId, selectReplayChallengeStatus } from '../game/simulation/gameReducer'
import { buildFactorySceneState } from '../render/adapters/sceneState'
import { selectScore } from '../results/gameResults'
import type { GameSessionState, ProteinOption, StationId } from '../types'
import { CodonWheel } from './CodonWheel'
import { FactoryCanvas } from './FactoryCanvas'
import { TaskDock } from './TaskDock'

interface FactoryPlayScreenProps {
  dispatch: (action: GameAction) => void
  state: GameSessionState
}

export function FactoryPlayScreen({ dispatch, state }: FactoryPlayScreenProps) {
  const currentRound = rounds[state.currentRoundIndex]
  const activeStationId = selectActiveStationId(state)
  const activeStation = stationForRoundType(currentRound.type)
  const score = selectScore(state.roundResults)
  const localStatus = state.saveStatus === 'saved-local' ? 'Saved on this device' : 'Practice on this device'
  const replayChallenge = selectReplayChallengeStatus(state)
  const sceneState = useMemo(() => buildFactorySceneState(state), [state])
  const onStationSelect = useCallback(
    (stationId: StationId) => dispatch({ type: 'SELECT_STATION', stationId }),
    [dispatch],
  )

  return (
    <main className="factory-play" data-testid="factory-play">
      <FactoryCanvas sceneState={sceneState} onStationSelect={onStationSelect} />

      <div className={`factory-hud ${state.taskDockOpen ? 'task-open' : ''}`} aria-label="Factory status">
        <section className="hud-cluster top-left">
          <div className="hud-chip objective-chip">
            <Anchor aria-hidden="true" size={20} />
            <div>
              <span>
                Round {state.currentRoundIndex + 1}/{rounds.length}
              </span>
              <strong>{activeStation.title}</strong>
            </div>
          </div>
          <div className="round-pips" aria-label="Round progress">
            {rounds.map((round, index) => (
              <span
                aria-label={`Round ${index + 1} ${index < state.currentRoundIndex ? 'complete' : 'pending'}`}
                className={index < state.currentRoundIndex ? 'complete' : index === state.currentRoundIndex ? 'current' : ''}
                key={round.id}
              />
            ))}
          </div>
        </section>

        <section className="hud-cluster top-right">
          <div className="hud-chip run-status-chip">
            <span>Run status</span>
            <strong>
              {score}/{rounds.length}
            </strong>
            <small>{localStatus}</small>
          </div>
          {replayChallenge && (
            <div className="hud-chip challenge-chip">
              <span>Replay challenge</span>
              <strong>{replayChallenge.replace('Replay challenge: ', '')}</strong>
            </div>
          )}
        </section>

        {!state.taskDockOpen && (
          <>
            <section className="station-strip" aria-label="Factory stations">
              {stationDefinitions.map((station) => (
                <button
                  className={station.id === activeStationId ? 'station-button active' : 'station-button inactive'}
                  data-station-id={station.id}
                  key={station.id}
                  onClick={() => dispatch({ type: 'SELECT_STATION', stationId: station.id })}
                  type="button"
                >
                  <span>{station.shortTitle}</span>
                  <strong>{station.title}</strong>
                  {station.id === activeStationId && <small>Current</small>}
                </button>
              ))}
            </section>

            <section className="interaction-prompt">
              <strong>{state.feedback?.title ?? activeStation.title}</strong>
              <span>{state.feedback?.message ?? currentRound.prompt}</span>
              <button
                className="primary-action compact"
                onClick={() => dispatch({ type: 'OPEN_ACTIVE_STATION' })}
                type="button"
              >
                Start {activeStation.shortTitle}
              </button>
            </section>
          </>
        )}
      </div>

      {state.taskDockOpen && (
        <TaskDock
          feedback={state.feedback}
          onAppendBase={(base) => dispatch({ type: 'APPEND_BASE', base })}
          onBackspace={() => dispatch({ type: 'BACKSPACE' })}
          onCheckBaseRound={() => dispatch({ type: 'CHECK_BASE_ROUND' })}
          onCheckFullTranslation={() => dispatch({ type: 'CHECK_FULL_TRANSLATION' })}
          onCheckProtein={() => dispatch({ type: 'CHECK_PROTEIN' })}
          onCheckTranslationCodon={() => dispatch({ type: 'CHECK_TRANSLATION_CODON' })}
          onClear={() => dispatch({ type: 'CLEAR_INPUT' })}
          onClose={() => dispatch({ type: 'CLOSE_TASK_DOCK' })}
          onGoToTranslationCodon={(index) => dispatch({ type: 'GO_TO_TRANSLATION_CODON', index })}
          onOpenCodonWheel={() => dispatch({ type: 'OPEN_CODON_WHEEL' })}
          onSelectProtein={(option: ProteinOption) => dispatch({ type: 'SELECT_PROTEIN', option })}
          onSelectTranslation={(index, value) => dispatch({ type: 'SELECT_TRANSLATION', index, value })}
          onToggleHint={() => dispatch({ type: 'TOGGLE_HINT' })}
          round={currentRound}
          roundNumber={state.currentRoundIndex + 1}
          roundState={state.roundState}
          totalRounds={rounds.length}
        />
      )}

      <CodonWheel
        activeCodonIndex={currentRound.type === 'translation' ? state.roundState.currentCodonIndex : 0}
        codons={currentRound.type === 'translation' ? currentRound.codons : []}
        isOpen={state.isCodonWheelOpen}
        onClose={() => dispatch({ type: 'CLOSE_CODON_WHEEL' })}
      />
    </main>
  )
}
