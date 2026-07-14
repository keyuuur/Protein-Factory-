import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import { createInitialGameState, gameReducer } from './game/simulation/gameReducer'
import { toProteinFactoryAttemptV4 } from './results/appsScriptMapper'
import { buildFinalPayload } from './results/gameResults'
import { hasIncompatibleLocalCheckpoint, type LocalSaveResult } from './results/localResultSaver'
import { submissionCoordinator, type AttemptSubmissionState } from './results/submissionCoordinator'
import type { CheckpointEnvelopeV4, GameSessionState } from './types'
import { EndScreen } from './ui/EndScreen'
import { FactoryPlayScreen } from './ui/FactoryPlayScreen'
import { StartScreen } from './ui/StartScreen'
import { TutorialScreen } from './ui/TutorialScreen'
import { TransferScreen } from './ui/TransferScreen'
import type { SubmissionStatus } from './results/submissionQueue'

type RecoveryChoice = 'prompt' | 'resume' | 'start-over'

function App() {
  const [checkpoint, setCheckpoint] = useState<CheckpointEnvelopeV4 | null>(null)
  const [confirmStartOver, setConfirmStartOver] = useState(false)
  const deleteSavedRunRef = useRef<HTMLButtonElement | null>(null)
  const startOverRef = useRef<HTMLButtonElement | null>(null)
  const [hasLegacyCheckpoint, setHasLegacyCheckpoint] = useState(false)
  const [recoveryChoice, setRecoveryChoice] = useState<RecoveryChoice>('start-over')
  const [repositoryReady, setRepositoryReady] = useState(false)
  const [sessionKey, setSessionKey] = useState(0)
  const handleRecoveryImported = useCallback(async () => {
    const restoredCheckpoint = await submissionCoordinator.getCheckpoint()
    setCheckpoint(restoredCheckpoint)
    setRecoveryChoice(restoredCheckpoint ? 'prompt' : 'start-over')
    setSessionKey((value) => value + 1)
  }, [])
  const handleCheckpointCleared = useCallback(() => {
    void submissionCoordinator.clearCheckpoint()
    setCheckpoint(null)
    setRecoveryChoice('start-over')
  }, [])

  useEffect(() => {
    let active = true
    void submissionCoordinator.start().then(async () => {
      const savedCheckpoint = await submissionCoordinator.getCheckpoint()
      if (!active) return
      setCheckpoint(savedCheckpoint)
      setRecoveryChoice(savedCheckpoint ? 'prompt' : 'start-over')
      setHasLegacyCheckpoint(!savedCheckpoint && hasIncompatibleLocalCheckpoint())
      setRepositoryReady(true)
    }).catch((error) => {
      console.error(`Result repository failed to initialize: ${error instanceof Error ? error.message : 'Unknown error.'}`)
      if (active) setRepositoryReady(true)
    })
    return () => {
      active = false
      submissionCoordinator.stop()
    }
  }, [])

  useEffect(() => {
    if (confirmStartOver) deleteSavedRunRef.current?.focus()
  }, [confirmStartOver])

  if (!repositoryReady) {
    return <main className="start-screen" aria-busy="true"><p role="status">Opening saved factory work...</p></main>
  }

  if (!checkpoint && hasLegacyCheckpoint) {
    return (
      <main className="start-screen" data-testid="version-recovery-screen">
        <section className="start-hero" aria-labelledby="version-recovery-title">
          <p className="eyebrow">Protein Factory was updated</p>
          <h1 id="version-recovery-title">Start the new three-protein mission</h1>
          <p className="start-copy">Your completed result history is still saved. An unfinished run from the earlier game cannot be resumed in this version.</p>
          <button
            className="primary-action"
            onClick={() => {
              void submissionCoordinator.clearCheckpoint()
              setHasLegacyCheckpoint(false)
              setSessionKey((value) => value + 1)
            }}
            type="button"
          >
            Start New Run
          </button>
        </section>
      </main>
    )
  }

  if (checkpoint && recoveryChoice === 'prompt') {
    const savedRound = checkpoint.state.runManifest.rounds[checkpoint.state.currentRoundIndex]
    const savedProtein = (savedRound?.context.sequenceIndex ?? 0) + 1
    const savedAction = savedRound?.context.action === 'transcription'
      ? 'Transcription'
      : savedRound?.context.action === 'translation'
        ? 'Translation'
        : 'Function Test'
    return (
      <main className="start-screen" data-testid="recovery-screen">
        <section className="start-hero" aria-labelledby="recovery-title">
          <p className="eyebrow">Saved factory run found</p>
          <h1 id="recovery-title">Continue where you left off?</h1>
          <p className="start-copy">Your progress is stored on this device.</p>
          <p className="recovery-summary">
            <strong>{checkpoint.state.identity.firstName}</strong>
            <span>Period {checkpoint.state.identity.period}</span>
            <span>Protein {savedProtein} of 3</span>
            <span>{savedAction}</span>
          </p>
          <div className="end-actions">
            <button className="primary-action" onClick={() => setRecoveryChoice('resume')} type="button">
              Resume
            </button>
            {!confirmStartOver ? (
              <button className="secondary-action" onClick={() => setConfirmStartOver(true)} ref={startOverRef} type="button">Start Over</button>
            ) : (
              <div aria-label="Confirm deleting saved run" className="start-over-confirmation" role="group">
                <button
                  className="secondary-action danger-action"
                  onClick={() => {
                    void submissionCoordinator.clearCheckpoint()
                    setCheckpoint(null)
                    setRecoveryChoice('start-over')
                    setConfirmStartOver(false)
                    setSessionKey((value) => value + 1)
                  }}
                  ref={deleteSavedRunRef}
                  type="button"
                >
                  Delete saved run
                </button>
                <button className="secondary-action" onClick={() => {
                  setConfirmStartOver(false)
                  window.requestAnimationFrame(() => startOverRef.current?.focus())
                }} type="button">Cancel</button>
              </div>
            )}
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
      onRecoveryImported={handleRecoveryImported}
    />
  )
}

interface GameSessionProps {
  initialState?: GameSessionState
  onCheckpointCleared: () => void
  onRecoveryImported: () => Promise<void>
}

function GameSession({ initialState, onCheckpointCleared, onRecoveryImported }: GameSessionProps) {
  const [state, dispatch] = useReducer(
    gameReducer,
    initialState,
    (savedState) => savedState ?? createInitialGameState(),
  )
  const [saveResult, setSaveResult] = useState<LocalSaveResult | null>(null)
  const [submissionStatus, setSubmissionStatus] = useState<SubmissionStatus>('queued')
  const [submissionState, setSubmissionState] = useState<AttemptSubmissionState>(() =>
    submissionCoordinator.getAttemptState(state.attemptId),
  )
  const [recoveryMessage, setRecoveryMessage] = useState('')
  const [allowUnsafeLeave, setAllowUnsafeLeave] = useState(false)
  const submittedAttemptRef = useRef<string | null>(null)
  const finalPayload = useMemo(() => buildFinalPayload(state), [state])

  useEffect(() => submissionCoordinator.subscribe(state.attemptId, (nextState) => {
    setSubmissionState(nextState)
    setSubmissionStatus(nextState.status)
    if (nextState.status === 'submitted') onCheckpointCleared()
  }), [onCheckpointCleared, state.attemptId])

  useEffect(() => {
    setAllowUnsafeLeave(false)
    setRecoveryMessage('')
    setSaveResult(null)
  }, [state.attemptId])

  useEffect(() => {
    if (state.screen !== 'end') return
    window.scrollTo({ left: 0, top: 0, behavior: 'instant' })
  }, [state.screen])

  useEffect(() => {
    if (state.screen === 'start') {
      return
    }

    void submissionCoordinator.saveCheckpoint(state).then((result) => {
      if (result.durability !== 'memory-only') return
      dispatch({ type: 'LOCAL_SAVE_FAILED' })
      console.warn('Checkpoint is temporarily held in memory only.')
    }).catch((error) => {
      dispatch({ type: 'LOCAL_SAVE_FAILED' })
      console.warn(`Local checkpoint failed: ${error instanceof Error ? error.message : 'Unknown error.'}`)
    })

    if (state.screen !== 'end') {
      return
    }
    if (submittedAttemptRef.current === state.attemptId) return
    submittedAttemptRef.current = state.attemptId

    const submissionAttempt = toProteinFactoryAttemptV4(finalPayload)
    void submissionCoordinator.completeAttempt(finalPayload, submissionAttempt).then((result) => {
      setSaveResult(result.durability === 'memory-only'
        ? { error: 'Browser storage is unavailable. Export a recovery file before leaving.', ok: false }
        : { ok: true })
      setSubmissionState(result)
      setSubmissionStatus(result.status)
    }).catch((error) => {
      setSaveResult({ error: error instanceof Error ? error.message : 'Result save failed.', ok: false })
      setSubmissionStatus('failed')
      console.warn(`Result coordination failed: ${error instanceof Error ? error.message : 'Unknown error.'}`)
    })
  }, [finalPayload, onCheckpointCleared, state])

  if (state.screen === 'start') {
    return (
      <StartScreen
        initialPeriod={state.identity.period}
        onRestoreRecovery={async (file) => {
          await submissionCoordinator.importRecoveryJson(await file.text())
          await onRecoveryImported()
        }}
        onStart={(firstName, period, demoMode, settings) =>
          dispatch({ type: 'START_GAME', demoMode, firstName, period, settings, now: Date.now() })
        }
      />
    )
  }

  if (state.screen === 'tutorial') {
    return (
      <>
        <TutorialScreen onContinue={() => dispatch({ type: 'START_ROUNDS' })} />
        <StorageWarning visible={state.saveStatus === 'failed-local'} />
      </>
    )
  }

  if (state.screen === 'transfer') {
    const task = state.transferTasks[state.currentTransferIndex]
    return task ? (
      <>
        <TransferScreen
          current={state.currentTransferIndex + 1}
          key={task.id}
          onSubmit={(answer) => dispatch({ type: 'SUBMIT_TRANSFER', answer, now: Date.now() })}
          task={task}
          total={state.transferTasks.length}
        />
        <StorageWarning visible={state.saveStatus === 'failed-local'} />
      </>
    ) : null
  }

  if (state.screen === 'end') {
    return (
      <>
        <EndScreen
          navigationBlocked={submissionState.guarded && !allowUnsafeLeave}
          payload={finalPayload}
          saveResult={saveResult}
          submissionStatus={submissionStatus}
          onReplay={() => {
            if (submissionCoordinator.confirmLeave(state.attemptId)) dispatch({ type: 'REPLAY', now: Date.now() })
          }}
          onRestart={() => {
            if (!submissionCoordinator.confirmLeave(state.attemptId)) return
            onCheckpointCleared()
            dispatch({ type: 'RESTART', now: Date.now() })
          }}
        />
        <section className="teacher-results" data-testid="submission-recovery-tools">
          <h2>Submission recovery</h2>
          <p role="status">
            {submissionState.durability === 'memory-only'
              ? 'This result only exists in this tab. Retry now or export a recovery file before leaving.'
              : submissionState.error ?? 'A durable device copy is available.'}
          </p>
          <div className="end-actions">
            {submissionStatus !== 'submitted' && (
              <button className="secondary-action" onClick={() => void submissionCoordinator.retry(state.attemptId)} type="button">
                Retry submission
              </button>
            )}
            <button className="secondary-action" onClick={() => void submissionCoordinator.downloadRecoveryJson()} type="button">
              Export recovery file
            </button>
            {submissionState.guarded && !allowUnsafeLeave && (
              <button
                className="secondary-action danger-action"
                onClick={() => {
                  if (submissionCoordinator.confirmLeave(state.attemptId)) setAllowUnsafeLeave(true)
                }}
                type="button"
              >
                Leave without saving
              </button>
            )}
            <label className="secondary-action recovery-import">
              Import recovery file
              <input
                accept="application/json,.json"
                onChange={(event) => {
                  const file = event.currentTarget.files?.[0]
                  if (!file) return
                  void file.text().then((text) => submissionCoordinator.importRecoveryJson(text)).then(() => {
                    setRecoveryMessage('Recovery file imported. Pending submissions will retry automatically.')
                  }).catch((error) => {
                    setRecoveryMessage(error instanceof Error ? error.message : 'Recovery import failed.')
                  })
                }}
                type="file"
              />
            </label>
          </div>
          {recoveryMessage && <p role="status">{recoveryMessage}</p>}
        </section>
      </>
    )
  }

  return <FactoryPlayScreen dispatch={dispatch} state={state} />
}

function StorageWarning({ visible }: { visible: boolean }) {
  if (!visible) return null
  return (
    <p className="storage-alert" data-testid="storage-warning" role="alert">
      Device storage unavailable. Keep this tab open until your run is finished.
    </p>
  )
}

export default App
