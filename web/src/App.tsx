import { useCallback, useEffect, useMemo, useReducer, useState } from 'react'
import { createInitialGameState, gameReducer } from './game/simulation/gameReducer'
import { toProteinFactoryAttemptV3 } from './results/appsScriptMapper'
import { buildFinalPayload } from './results/gameResults'
import {
  clearLocalCheckpoint,
  readLocalCheckpoint,
  saveLocalCheckpoint,
  saveLocalResult,
  type CheckpointEnvelopeV3,
  type LocalSaveResult,
} from './results/localResultSaver'
import { queueSubmission, retryPendingSubmissions } from './results/submissionQueue'
import type { GameSessionState } from './types'
import { EndScreen } from './ui/EndScreen'
import { FactoryPlayScreen } from './ui/FactoryPlayScreen'
import { RoundIntro } from './ui/RoundIntro'
import { StartScreen } from './ui/StartScreen'
import { TutorialScreen } from './ui/TutorialScreen'
import { TransferScreen } from './ui/TransferScreen'
import type { SubmissionStatus } from './results/submissionQueue'

type RecoveryChoice = 'prompt' | 'resume' | 'start-over'

function App() {
  const [checkpoint, setCheckpoint] = useState<CheckpointEnvelopeV3 | null>(() => readLocalCheckpoint())
  const [recoveryChoice, setRecoveryChoice] = useState<RecoveryChoice>(() =>
    readLocalCheckpoint() ? 'prompt' : 'start-over',
  )
  const [sessionKey, setSessionKey] = useState(0)
  const handleCheckpointCleared = useCallback(() => {
    setCheckpoint(null)
    setRecoveryChoice('start-over')
  }, [])

  useEffect(() => {
    const retry = () => {
      void retryPendingSubmissions().then((items) => {
        if (checkpoint && items.some((item) => item.attempt.attemptId === checkpoint.state.attemptId && item.status === 'submitted')) {
          clearLocalCheckpoint()
          setCheckpoint(null)
          setRecoveryChoice('start-over')
        }
      })
    }

    retry()
    window.addEventListener('online', retry)
    return () => window.removeEventListener('online', retry)
  }, [checkpoint])

  if (checkpoint && recoveryChoice === 'prompt') {
    return (
      <main className="start-screen" data-testid="recovery-screen">
        <section className="start-hero" aria-labelledby="recovery-title">
          <p className="eyebrow">Saved factory run found</p>
          <h1 id="recovery-title">Continue where you left off?</h1>
          <p className="start-copy">Your progress is stored on this device.</p>
          <div className="end-actions">
            <button className="primary-action" onClick={() => setRecoveryChoice('resume')} type="button">
              Resume
            </button>
            <button
              className="secondary-action"
              onClick={() => {
                clearLocalCheckpoint()
                setCheckpoint(null)
                setRecoveryChoice('start-over')
                setSessionKey((value) => value + 1)
              }}
              type="button"
            >
              Start Over
            </button>
          </div>
        </section>
      </main>
    )
  }

  return (
    <GameSession
      initialState={recoveryChoice === 'resume' ? checkpoint?.state : undefined}
      key={sessionKey}
      onCheckpointCleared={handleCheckpointCleared}
    />
  )
}

interface GameSessionProps {
  initialState?: GameSessionState
  onCheckpointCleared: () => void
}

function GameSession({ initialState, onCheckpointCleared }: GameSessionProps) {
  const [state, dispatch] = useReducer(
    gameReducer,
    initialState,
    (savedState) => savedState ?? createInitialGameState(),
  )
  const [saveResult, setSaveResult] = useState<LocalSaveResult | null>(null)
  const [submissionStatus, setSubmissionStatus] = useState<SubmissionStatus>('local-draft')
  const rounds = state.runManifest.rounds
  const currentRound = rounds[state.currentRoundIndex]
  const finalPayload = useMemo(() => buildFinalPayload(state), [state])

  useEffect(() => {
    if (state.screen === 'start') {
      return
    }

    const checkpointResult = saveLocalCheckpoint(state)
    if (!checkpointResult.ok) {
      dispatch({ type: 'LOCAL_SAVE_FAILED' })
      console.warn(`Local checkpoint failed: ${checkpointResult.error}`)
    }

    if (state.screen !== 'end') {
      return
    }

    const localResult = saveLocalResult(finalPayload)
    setSaveResult(localResult)
    if (!localResult.ok) {
      console.warn(`Local result save failed: ${localResult.error}`)
      return
    }

    try {
      setSubmissionStatus(queueSubmission(toProteinFactoryAttemptV3(finalPayload)).status)
      void retryPendingSubmissions({
        onStatusChange: (item) => {
          if (item.attempt.attemptId === state.attemptId) setSubmissionStatus(item.status)
        },
      }).then((items) => {
        if (items.some((item) => item.attempt.attemptId === state.attemptId && item.status === 'submitted')) {
          clearLocalCheckpoint()
          onCheckpointCleared()
        }
      })
    } catch (error) {
      setSubmissionStatus('failed')
      console.warn(`Submission queue failed: ${error instanceof Error ? error.message : 'Unknown error.'}`)
    }
  }, [finalPayload, onCheckpointCleared, state])

  if (state.screen === 'start') {
    return (
      <StartScreen
        initialPeriod={state.identity.period}
        onStart={(firstName, period, demoMode, settings) =>
          dispatch({ type: 'START_GAME', demoMode, firstName, period, settings, now: Date.now() })
        }
      />
    )
  }

  if (state.screen === 'tutorial') {
    return <TutorialScreen onContinue={() => dispatch({ type: 'START_ROUNDS' })} />
  }

  if (state.screen === 'intro') {
    return (
      <RoundIntro
        onBegin={() => dispatch({ type: 'BEGIN_ROUND' })}
        round={currentRound}
        roundNumber={state.currentRoundIndex + 1}
        totalRounds={rounds.length}
      />
    )
  }

  if (state.screen === 'transfer') {
    const task = state.transferTasks[state.currentTransferIndex]
    return task ? (
      <TransferScreen
        current={state.currentTransferIndex + 1}
        key={task.id}
        onSubmit={(answer) => dispatch({ type: 'SUBMIT_TRANSFER', answer, now: Date.now() })}
        task={task}
        total={state.transferTasks.length}
      />
    ) : null
  }

  if (state.screen === 'end') {
    return (
      <EndScreen
        payload={finalPayload}
        saveResult={saveResult}
        submissionStatus={submissionStatus}
        onReplay={() => dispatch({ type: 'REPLAY', now: Date.now() })}
        onRestart={() => {
          clearLocalCheckpoint()
          onCheckpointCleared()
          dispatch({ type: 'RESTART', now: Date.now() })
        }}
      />
    )
  }

  return <FactoryPlayScreen dispatch={dispatch} state={state} />
}

export default App
