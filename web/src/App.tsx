import { useEffect, useMemo, useReducer, useState } from 'react'
import { rounds } from './game/content/rounds'
import { createInitialGameState, gameReducer } from './game/simulation/gameReducer'
import { buildFinalPayload } from './results/gameResults'
import { saveLocalCheckpoint, saveLocalResult, type LocalSaveResult } from './results/localResultSaver'
import { EndScreen } from './ui/EndScreen'
import { FactoryPlayScreen } from './ui/FactoryPlayScreen'
import { FeedbackScreen } from './ui/FeedbackScreen'
import { RoundIntro } from './ui/RoundIntro'
import { StartScreen } from './ui/StartScreen'
import { TutorialScreen } from './ui/TutorialScreen'

function App() {
  const [state, dispatch] = useReducer(gameReducer, undefined, () => createInitialGameState())
  const [saveResult, setSaveResult] = useState<LocalSaveResult | null>(null)
  const currentRound = rounds[state.currentRoundIndex]
  const finalPayload = useMemo(() => buildFinalPayload(state), [state])

  useEffect(() => {
    if (state.screen === 'end') {
      const result = saveLocalResult(finalPayload)
      setSaveResult(result)
      if (!result.ok) {
        console.warn(`Local result save failed: ${result.error}`)
      }
      return
    }

    if (state.screen !== 'start') {
      const result = saveLocalCheckpoint({
        attemptId: state.attemptId,
        screen: state.screen,
        studentName: state.identity.firstName,
        classPeriod: state.identity.period,
        currentRound: state.currentRoundIndex + 1,
        roundResults: state.roundResults,
        missedSkills: state.missedSkills,
        savedAt: new Date().toISOString(),
      })
      if (!result.ok) {
        console.warn(`Local checkpoint failed: ${result.error}`)
      }
    }
  }, [finalPayload, state])

  if (state.screen === 'start') {
    return (
      <StartScreen
        initialPeriod={state.identity.period}
        onStart={(firstName, period, demoMode) =>
          dispatch({ type: 'START_GAME', demoMode, firstName, period, now: Date.now() })
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

  if (state.screen === 'success' && state.feedback) {
    return (
      <FeedbackScreen
        feedback={state.feedback}
        isLastRound={state.currentRoundIndex === rounds.length - 1}
        onContinue={() => dispatch({ type: 'CONTINUE_AFTER_SUCCESS', now: Date.now() })}
        round={currentRound}
      />
    )
  }

  if (state.screen === 'end') {
    return (
      <EndScreen
        payload={finalPayload}
        saveResult={saveResult}
        onReplay={() => dispatch({ type: 'REPLAY', now: Date.now() })}
        onRestart={() => dispatch({ type: 'RESTART', now: Date.now() })}
      />
    )
  }

  return <FactoryPlayScreen dispatch={dispatch} state={state} />
}

export default App
