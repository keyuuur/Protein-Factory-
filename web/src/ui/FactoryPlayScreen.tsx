import { Dna, Volume2, VolumeX } from 'lucide-react'
import { useCallback, useMemo, useState } from 'react'
import { stationForRoundType } from '../game/content/rounds'
import type { GameAction } from '../game/simulation/gameReducer'
import { selectReplayChallengeStatus } from '../game/simulation/gameReducer'
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
  const rounds = state.runManifest.rounds
  const currentRound = rounds[state.currentRoundIndex]
  const activeStation = stationForRoundType(currentRound.type)
  const score = selectScore(state.roundResults)
  const localStatus = state.saveStatus === 'failed-local'
    ? 'Device storage unavailable'
    : state.saveStatus === 'saved-local'
      ? 'Saved on this device'
      : 'Practice on this device'
  const replayChallenge = selectReplayChallengeStatus(state)
  const sceneState = useMemo(() => buildFactorySceneState(state), [state])
  const [soundEnabled, setSoundEnabled] = useState(state.settings.soundEnabled)
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
            <Dna aria-hidden="true" size={20} />
            <div>
              <span>
                Round {state.currentRoundIndex + 1}/{rounds.length}
              </span>
              <strong>{sceneState.activeStationLabel}</strong>
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
          <button
            aria-label={soundEnabled ? 'Mute sound' : 'Turn on sound'}
            aria-pressed={soundEnabled}
            className="icon-button sound-toggle"
            onClick={() => setSoundEnabled((current) => !current)}
            title={soundEnabled ? 'Mute sound' : 'Turn on sound'}
            type="button"
          >
            {soundEnabled ? <Volume2 aria-hidden="true" size={20} /> : <VolumeX aria-hidden="true" size={20} />}
          </button>
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
          <section className="interaction-prompt">
            <div>
              <small>Current lab action</small>
              <strong>{sceneState.activeStationLabel}</strong>
              <span>{currentRound.prompt}</span>
            </div>
            <button
              className="primary-action compact"
              onClick={() => dispatch({ type: 'OPEN_ACTIVE_STATION' })}
              type="button"
            >
              Start {activeStation.shortTitle}
            </button>
          </section>
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

      {state.screen === 'success' && state.feedback && (
        <section className="shipment-overlay" role="status" data-testid="shipment-overlay">
          <div>
            <small>Production update</small>
            <strong>{state.feedback.title}</strong>
            <span>{state.feedback.message}</span>
          </div>
          <button className="primary-action compact" onClick={() => dispatch({ type: 'CONTINUE_AFTER_SUCCESS', now: Date.now() })} type="button">
            {state.currentRoundIndex === rounds.length - 1 ? 'Finish order' : 'Continue production'}
          </button>
        </section>
      )}
    </main>
  )
}
