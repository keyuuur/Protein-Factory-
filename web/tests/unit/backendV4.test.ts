import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { afterEach, describe, expect, it } from 'vitest'
import handler, {
  isValidAttempt,
  normalizeAttemptForSubmission,
  submissionErrorCodes,
} from '../../api/attempt.js'
import {
  V4_FAMILY_DEFINITIONS,
  V4_FUNCTION_REFERENCE_ROWS,
} from '../../shared/catalogV4.js'
import { proteinSequenceFamilies } from '../../src/game/content/rounds'
import { createInitialGameState, gameReducer } from '../../src/game/simulation/gameReducer'
import { buildFinalPayload } from '../../src/results/gameResults'
import { toProteinFactoryAttemptV4 } from '../../src/results/appsScriptMapper'
import type { GameSessionState, ProteinFactoryAttemptV4 } from '../../src/types'

describe('V4 canonical backend validation', () => {
  it('shares a deeply frozen catalog with client content', () => {
    expect(Object.isFrozen(V4_FAMILY_DEFINITIONS)).toBe(true)
    expect(Object.isFrozen(V4_FAMILY_DEFINITIONS[0].original.codons)).toBe(true)
    expect(Object.isFrozen(V4_FUNCTION_REFERENCE_ROWS[0].aminoAcidSequence)).toBe(true)
    expect(proteinSequenceFamilies.map((family) => family.id)).toEqual(
      V4_FAMILY_DEFINITIONS.map((family) => family.id),
    )
  })

  it('rejects canonical stage, product, and aggregate tampering', () => {
    const attempt = completedAttempt()
    expect(isValidAttempt(attempt)).toBe(true)

    const stageTamper = structuredClone(attempt)
    const firstRound = stageTamper.runManifest.rounds[0]
    if (firstRound.type !== 'transcription') throw new Error('Expected transcription round')
    firstRound.answer = `${firstRound.answer[0] === 'A' ? 'U' : 'A'}${firstRound.answer.slice(1)}`
    expect(isValidAttempt(stageTamper)).toBe(false)

    const productTamper = structuredClone(attempt)
    productTamper.completedProducts[0].expressedTrait = 'Injected trait'
    expect(isValidAttempt(productTamper)).toBe(false)

    const aggregateTamper = structuredClone(attempt)
    aggregateTamper.independencePercent = 0
    expect(isValidAttempt(aggregateTamper)).toBe(false)
  })

  it('defaults queued V4 and V3 records without weakening invalid supplied values', () => {
    const current = completedAttempt() as ProteinFactoryAttemptV4 & Record<string, unknown>
    delete current.attemptKind
    delete current.parentAttemptId
    delete current.completionPercent
    delete current.independencePercent

    const normalized = normalizeAttemptForSubmission(current)
    expect(normalized).toMatchObject({
      attemptKind: 'full-run',
      completionPercent: 100,
      independencePercent: 100,
      parentAttemptId: null,
    })
    expect(isValidAttempt(current)).toBe(true)
    expect(isValidAttempt({
      attemptId: 'queued-v3-attempt',
      classPeriod: '2',
      schemaVersion: 'protein-factory-attempt-v3',
      stageResults: [],
      studentName: 'Ada',
      transferResults: [],
    })).toBe(true)

    expect(isValidAttempt({ ...normalized, attemptKind: 'unknown-kind' })).toBe(false)
  })

  it('rejects lineage and transfer contracts that do not match the attempt kind', () => {
    const attempt = completedAttempt()
    expect(isValidAttempt({ ...attempt, parentAttemptId: 'injected-parent' })).toBe(false)

    const targeted = targetedAttempt(attempt)
    expect(isValidAttempt(targeted)).toBe(true)
    expect(isValidAttempt({ ...targeted, parentAttemptId: targeted.attemptId })).toBe(false)
    expect(isValidAttempt({ ...targeted, transferResults: [] })).toBe(false)
  })

  it('rejects tampered recovery and teacher-facing replay claims', () => {
    const targeted = targetedAttempt(completedAttempt())
    expect(isValidAttempt(targeted)).toBe(true)

    expect(isValidAttempt({ ...targeted, recoveredConcepts: ['protein-trait-model'] })).toBe(false)
    expect(isValidAttempt({ ...targeted, replayChallengeMet: !targeted.replayChallengeMet })).toBe(false)
    expect(isValidAttempt({ ...targeted, reviewSummary: ['Everything recovered'] })).toBe(false)

    const missedSkillTamper = structuredClone(targeted)
    missedSkillTamper.missedSkills[0].roundId = targeted.runManifest.rounds[1].id
    expect(isValidAttempt(missedSkillTamper)).toBe(false)
  })
})

describe('submission response and sheet safety contracts', () => {
  const originalUrl = process.env.APPS_SCRIPT_WEB_APP_URL
  const originalToken = process.env.RESULTS_WRITE_TOKEN

  afterEach(() => {
    restoreEnvironment('APPS_SCRIPT_WEB_APP_URL', originalUrl)
    restoreEnvironment('RESULTS_WRITE_TOKEN', originalToken)
  })

  it('returns stable non-retryable validation errors with the attempt ID', async () => {
    process.env.APPS_SCRIPT_WEB_APP_URL = 'https://example.test/apps-script'
    process.env.RESULTS_WRITE_TOKEN = 'test-token'
    const response = mockResponse()

    await handler({
      body: { attempt: { attemptId: 'invalid-attempt-id' } },
      method: 'POST',
    }, response)

    expect(response.statusCode).toBe(400)
    expect(response.body).toEqual({
      attemptId: 'invalid-attempt-id',
      code: submissionErrorCodes.invalidAttempt,
      error: 'Invalid Protein Factory attempt.',
      ok: false,
      retryable: false,
    })
  })

  it('neutralizes formula-like text and exposes the appended V4 columns', () => {
    const context: Record<string, unknown> = {}
    const dataScript = readFileSync(new URL('../../../Data.gs', import.meta.url), 'utf8')
    runInNewContext(dataScript, context)
    const literalCell = context.literalCell_ as (value: unknown) => string
    const headers = context.PROTEIN_FACTORY_V4_HEADERS as string[]

    expect(literalCell('=IMPORTDATA("https://example.test")')).toBe("'=IMPORTDATA(\"https://example.test\")")
    expect(literalCell('  +1+1')).toBe("'  +1+1")
    expect(literalCell('Ada')).toBe('Ada')
    expect(headers.slice(-4)).toEqual([
      'Completion Percent', 'Independence Percent', 'Attempt Kind', 'Parent Attempt ID',
    ])
  })
})

function completedAttempt(): ProteinFactoryAttemptV4 {
  let state = startRun()
  while (state.screen === 'playing' || state.screen === 'sequence-transition') {
    if (!state.roundResults.some((result) => result.round === state.currentRoundIndex + 1)) {
      state = completeCurrentStage(state)
    }
    state = gameReducer(state, { type: 'CONTINUE_AFTER_SUCCESS', now: 20_000 + state.currentRoundIndex * 1_000 })
  }
  return toProteinFactoryAttemptV4(buildFinalPayload(state))
}

function targetedAttempt(attempt: ProteinFactoryAttemptV4): ProteinFactoryAttemptV4 {
  const supported = structuredClone(attempt)
  supported.stageResults[0].mistakes = 1
  supported.stageResults[0].repairs = 1
  supported.stageResults[0].attempts = 2
  supported.stageResults[0].independent = false
  supported.stageResults[0].firstTryCorrect = false
  supported.stageResults[0].supportLevel = 1
  supported.roundResults = structuredClone(supported.stageResults)
  supported.missedSkills = [{
    attempts: 1,
    category: 'rna-template-pairing',
    expected: supported.stageResults[0].expected,
    reason: 'mistake',
    round: 1,
    roundId: supported.stageResults[0].id,
    skillId: `${supported.stageResults[0].id}-rna-template-pairing-mistake`,
    submitted: 'wrong answer',
    title: supported.stageResults[0].title,
    type: supported.stageResults[0].type,
  }]
  supported.attemptKind = 'targeted-practice'
  supported.parentAttemptId = 'pf-parent-attempt'
  supported.attempts = attempt.attempts + 1
  supported.mistakes = 1
  supported.repairs = 1
  supported.independentStages = 8
  supported.independencePercent = 88.9
  supported.cleanRounds = 8
  supported.supportedRounds = 1
  supported.productionRating = 'Stable'
  supported.factoryRating = 'Stable'
  supported.activeReplayChallenge = `Clear ${supported.stageResults[0].title} independently with a new family.`
  supported.replayGoal = `Use a different family to clear ${supported.stageResults[0].title} without support.`
  supported.reviewSummary = ['DNA-to-mRNA pairing (recovered on transfer)']
  supported.replayChallengeMet = true
  supported.recoveredConcepts = ['rna-template-pairing']
  supported.transferResults = [{
    expected: 'AUGGCUUAACGU',
    recovered: true,
    sourceFamilyId: '',
    submitted: 'AUGGCUUAACGU',
    targetCategory: 'rna-template-pairing',
    targetStage: 'transcription',
    taskId: '',
  }]
  const transfer = supported.transferResults[0]
  const source = V4_FAMILY_DEFINITIONS.find((family) => family.id !== supported.runManifest.familyId)
  if (!source) throw new Error('Expected alternate transfer family')
  transfer.sourceFamilyId = source.id
  transfer.taskId = `transfer-transcription-${source.id}`
  transfer.expected = source.changedChain.codons.join('')
  transfer.submitted = transfer.expected
  return supported
}

function startRun(): GameSessionState {
  let state = createInitialGameState(1_000)
  state = gameReducer(state, {
    demoMode: false,
    firstName: 'Ada',
    now: 1_000,
    period: '2',
    settings: { replayMode: 'full', soundEnabled: false, supportMode: 'guided' },
    type: 'START_GAME',
  })
  return gameReducer(state, { type: 'START_ROUNDS' })
}

function completeCurrentStage(state: GameSessionState): GameSessionState {
  const round = state.runManifest.rounds[state.currentRoundIndex]
  let next = state
  if (round.type === 'transcription') {
    for (const [index, base] of [...round.answer].entries()) {
      if (next.roundState.input[index] !== base) next = gameReducer(next, { type: 'APPEND_BASE', base })
    }
    return gameReducer(next, { type: 'CHECK_BASE_ROUND' })
  }
  if (round.type === 'translation') {
    for (let index = 0; index < round.answers.length; index += 1) {
      if (next.roundState.answers[index] === round.answers[index]) continue
      next = gameReducer(next, { type: 'SELECT_TRANSLATION', index, value: round.answers[index] })
      next = gameReducer(next, { type: 'CHECK_TRANSLATION_CODON' })
    }
    return next
  }
  next = gameReducer(next, { type: 'SELECT_FUNCTION_ROW', rowId: round.correctRowId })
  return gameReducer(next, { type: 'CHECK_FUNCTION_ROW' })
}

function mockResponse() {
  return {
    body: undefined as unknown,
    headers: {} as Record<string, string>,
    statusCode: 0,
    json(value: unknown) {
      this.body = value
      return this
    },
    setHeader(name: string, value: string) {
      this.headers[name] = value
    },
    status(value: number) {
      this.statusCode = value
      return this
    },
  }
}

function restoreEnvironment(name: string, value: string | undefined): void {
  if (value === undefined) delete process.env[name]
  else process.env[name] = value
}
