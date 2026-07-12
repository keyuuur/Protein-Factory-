import { describe, expect, it } from 'vitest'
import { rounds, stationIdForRoundType, validateContent } from '../../src/game/content/rounds'
import { createInitialGameState, createRoundState, gameReducer } from '../../src/game/simulation/gameReducer'
import { buildFinalPayload, selectScore } from '../../src/results/gameResults'
import { toAppsScriptAttemptPayload } from '../../src/results/appsScriptMapper'

describe('Level 2 content', () => {
  it('has internally valid round data', () => {
    expect(validateContent()).toEqual([])
  })
})

describe('gameReducer', () => {
  it('requires a real name unless explicit demo mode is selected', () => {
    let state = createInitialGameState(1000)
    state = gameReducer(state, { type: 'START_GAME', demoMode: false, firstName: '   ', period: '2', now: 1000 })

    expect(state.screen).toBe('start')
    expect(state.identity.firstName).toBe('')

    state = gameReducer(state, { type: 'START_GAME', demoMode: false, firstName: 'Ada', period: '', now: 1000 })

    expect(state.screen).toBe('start')
    expect(state.identity.firstName).toBe('')

    state = gameReducer(state, { type: 'START_GAME', demoMode: true, firstName: '', period: '2', now: 1000 })

    expect(state.screen).toBe('tutorial')
    expect(state.identity.firstName).toBe('Demo Student')
    expect(state.identity.isDemo).toBe(true)
  })

  it('tracks wrong then correct as one score point with missed-skill evidence', () => {
    let state = createInitialGameState(1000)
    state = gameReducer(state, { type: 'START_GAME', demoMode: false, firstName: 'Ada', period: '2', now: 1000 })
    state = gameReducer(state, { type: 'START_ROUNDS' })
    state = gameReducer(state, { type: 'BEGIN_ROUND' })
    state = gameReducer(state, { type: 'SELECT_STATION', stationId: stationIdForRoundType(rounds[0].type) })
    for (const base of ['A', 'A', 'A', 'A']) {
      state = gameReducer(state, { type: 'APPEND_BASE', base })
    }
    state = gameReducer(state, { type: 'CHECK_BASE_ROUND' })

    expect(selectScore(state.roundResults)).toBe(0)
    expect(state.roundState.mistakes).toBe(1)
    expect(state.missedSkills).toHaveLength(1)
    expect(state.missedSkills[0].category).toBe('dna-base-pairing')
    expect(state.roundState.repairTarget?.kind).toBe('base')
    expect(state.roundState.repairTarget?.index).toBe(0)
    expect(state.feedback?.title).toBe('Check DNA pairing.')
    expect(state.feedback?.message).toContain('position 1')

    state = gameReducer(state, { type: 'APPEND_BASE', base: 'T' })
    expect(state.roundState.input).toBe('TAAA')
    expect(state.roundState.repairTarget).toBeNull()
    state = gameReducer(state, { type: 'CLEAR_INPUT' })
    for (const base of ['T', 'A', 'G', 'C']) state = gameReducer(state, { type: 'APPEND_BASE', base })
    state = gameReducer(state, { type: 'CHECK_BASE_ROUND' })
    state = gameReducer(state, { type: 'CHECK_BASE_ROUND' })

    expect(selectScore(state.roundResults)).toBe(1)
    expect(state.roundResults).toHaveLength(1)
    expect(state.roundResults[0].mistakes).toBe(1)
  })

  it('keeps identity on replay and clears identity on restart', () => {
    let state = createInitialGameState(1000)
    state = gameReducer(state, { type: 'START_GAME', demoMode: false, firstName: 'Maya', period: '4', now: 1000 })
    const oldAttemptId = state.attemptId
    state = gameReducer(state, { type: 'REPLAY', now: 5000 })

    expect(state.identity.firstName).toBe('Maya')
    expect(state.identity.period).toBe('4')
    expect(state.currentRoundIndex).toBe(0)
    expect(state.roundResults).toEqual([])
    expect(state.screen).toBe('intro')
    expect(state.attemptId).not.toBe(oldAttemptId)

    state = gameReducer(state, { type: 'RESTART', now: 6000 })

    expect(state.identity.firstName).toBe('')
    expect(state.identity.period).toBe('4')
    expect(state.screen).toBe('start')
  })

  it('separates selection from submission for translation and protein tasks', () => {
    let state = {
      ...createInitialGameState(1000),
      screen: 'playing' as const,
      currentRoundIndex: 4,
      roundState: createRoundState(rounds[4]),
      taskDockOpen: true,
    }

    state = gameReducer(state, { type: 'SELECT_TRANSLATION', index: 0, value: 'Val' })
    expect(state.roundState.attempts).toBe(0)
    expect(state.roundState.answers[0]).toBe('Val')

    state = gameReducer(state, { type: 'CHECK_TRANSLATION_CODON' })
    expect(state.roundState.attempts).toBe(1)
    expect(state.roundState.mistakes).toBe(1)
    expect(state.roundState.repairTarget?.kind).toBe('codon')
    expect(state.missedSkills[0].category).toBe('codon-lookup')
    expect(state.feedback?.title).toBe('Check codon translation.')
    expect(state.feedback?.message).toContain('AUG codes for Met')

    state = {
      ...createInitialGameState(1000),
      screen: 'playing' as const,
      currentRoundIndex: 6,
      roundState: createRoundState(rounds[6]),
      taskDockOpen: true,
    }

    const wrongOption = rounds[6].type === 'protein' ? rounds[6].options[1] : undefined
    expect(wrongOption).toBeDefined()
    state = gameReducer(state, { type: 'SELECT_PROTEIN', option: wrongOption! })
    expect(state.roundState.attempts).toBe(0)
    expect(state.roundState.selectedProtein).toBe('Altered Lactase')

    state = gameReducer(state, { type: 'CHECK_PROTEIN' })
    expect(state.roundState.attempts).toBe(1)
    expect(state.roundState.mistakes).toBe(1)
    expect(state.roundState.repairTarget?.kind).toBe('protein')
    expect(state.feedback?.title).toBe('Check model trait match.')
  })

  it('uses a stepper state for full translation rounds', () => {
    let state = {
      ...createInitialGameState(1000),
      screen: 'playing' as const,
      currentRoundIndex: 5,
      roundState: createRoundState(rounds[5]),
      taskDockOpen: true,
    }

    state = gameReducer(state, { type: 'SELECT_TRANSLATION', index: 0, value: 'Pro' })
    expect(state.roundState.currentCodonIndex).toBe(1)

    state = gameReducer(state, { type: 'SELECT_TRANSLATION', index: 1, value: 'Tyr' })
    expect(state.roundState.currentCodonIndex).toBe(2)

    state = gameReducer(state, { type: 'GO_TO_TRANSLATION_CODON', index: 0 })
    expect(state.roundState.currentCodonIndex).toBe(0)
  })

  it('builds a final payload with required accountability fields', () => {
    let state = createInitialGameState(1000)
    state = gameReducer(state, { type: 'START_GAME', demoMode: false, firstName: 'Kai', period: '5', now: 1000 })
    state = gameReducer(state, { type: 'START_ROUNDS' })

    rounds.forEach((round, index) => {
      if (state.screen === 'intro') {
        state = gameReducer(state, { type: 'BEGIN_ROUND' })
      }
      state = gameReducer(state, { type: 'SELECT_STATION', stationId: stationIdForRoundType(round.type) })

      if (round.type === 'dna' || round.type === 'transcription') {
        for (const base of round.answer) {
          state = gameReducer(state, { type: 'APPEND_BASE', base })
        }
        state = gameReducer(state, { type: 'CHECK_BASE_ROUND' })
      } else if (round.type === 'translation' && round.mode === 'perCodon') {
        round.answers.forEach((answer, answerIndex) => {
          state = gameReducer(state, { type: 'SELECT_TRANSLATION', index: answerIndex, value: answer })
          state = gameReducer(state, { type: 'CHECK_TRANSLATION_CODON' })
        })
      } else if (round.type === 'translation') {
        round.answers.forEach((answer, answerIndex) => {
          state = gameReducer(state, { type: 'SELECT_TRANSLATION', index: answerIndex, value: answer })
        })
        state = gameReducer(state, { type: 'CHECK_FULL_TRANSLATION' })
      } else {
        const option = round.options.find((item) => item.trait === round.correctTrait)
        expect(option).toBeDefined()
        state = gameReducer(state, { type: 'SELECT_PROTEIN', option: option! })
        state = gameReducer(state, { type: 'CHECK_PROTEIN' })
      }

      state = gameReducer(state, { type: 'CONTINUE_AFTER_SUCCESS', now: 1000 + index * 1000 + 1000 })
    })

    const payload = buildFinalPayload(state)

    expect(payload.game).toBe('Pirate Protein Factory')
    expect(payload.schemaVersion).toBe('web-final-v2')
    expect(payload.attemptId).toMatch(/^ppf-/)
    expect(payload.gameVersion).toContain('level-2')
    expect(payload.studentName).toBe('Kai')
    expect(payload.isDemo).toBe(false)
    expect(payload.score).toBe(8)
    expect(payload.maxScore).toBe(8)
    expect(payload.roundsCompleted).toBe(8)
    expect(payload.totalRounds).toBe(8)
    expect(payload.cleanRounds).toBe(8)
    expect(payload.supportedRounds).toBe(0)
    expect(payload.factoryRating).toBe('Perfect Run')
    expect(payload.replayGoal).toBe('Replay for a faster perfect run.')
    expect(payload.roundResults).toHaveLength(8)
    expect(payload.completionStatus).toBe('Completed')
    expect(payload.submitType).toBe('Final Submit')

    const mapped = toAppsScriptAttemptPayload(payload, 'unit-test-agent')
    expect(mapped.firstName).toBe('Kai')
    expect(mapped.period).toBe('5')
    expect(mapped.timeSpentSeconds).toBe(payload.timeSpent)
    expect(mapped.completedStatus).toBe('Completed')
    expect(mapped.roundsCompleted).toBe(8)
    expect(mapped.totalRounds).toBe(8)
    expect(mapped.isFinalSubmit).toBe(true)
    expect(mapped.userAgent).toBe('unit-test-agent')
  })
})
