import { expect, test } from '@playwright/test'
import {
  assertCanvasIsRendered,
  assertNoHorizontalOverflow,
  beginRun,
  clickCorrectFunctionRow,
  collectRuntimeIssues,
  completeCurrentAction,
  continueAfterSuccess,
  countArrayDifferences,
  countDifferences,
  currentRound,
  currentState,
  readLatestPayload,
} from './helpers'

test.describe('V4 desktop gameplay', () => {
  test.beforeEach(async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-chromium', 'Desktop Chromium owns the behavioral smoke suite.')
    await page.route('**/api/attempt', (route) => route.fulfill({
      body: JSON.stringify({ ok: true }),
      contentType: 'application/json',
      status: 200,
    }))
  })

  test('requires an identity and teaches the three-action loop before play', async ({ page }) => {
    const issues = collectRuntimeIssues(page)
    await page.goto('/')

    const begin = page.getByRole('button', { name: 'Begin' })
    await expect(page.getByRole('heading', { name: 'Protein Factory' })).toBeVisible()
    await expect(begin).toBeDisabled()
    await page.getByLabel('Class period').selectOption('3')
    await expect(begin).toBeDisabled()
    await page.getByLabel('First name').fill('Ava')
    await expect(begin).toBeEnabled()
    await begin.click()

    await expect(page.getByRole('heading', { name: 'Build one protein at a time.' })).toBeVisible()
    await expect(page.getByText('Pair each nucleotide in the DNA strand with its complementary RNA nucleotide.')).toBeVisible()
    await expect(page.getByText('Translate four mRNA codons into amino acids. A stop codon ends translation.')).toBeVisible()
    await expect(page.getByText('Match the chain to one row in the fictional fur-color practice model.')).toBeVisible()
    await page.getByRole('button', { name: 'Start Protein 1' }).click()

    await expect(page.getByRole('heading', { name: 'Build the mRNA' })).toBeVisible()
    await assertCanvasIsRendered(page)
    await assertNoHorizontalOverflow(page)
    issues.assertClean()
  })

  test('supports a confirmed projector demo without a student name', async ({ page }) => {
    const issues = collectRuntimeIssues(page)
    await page.goto('/')
    await page.locator('summary').filter({ hasText: 'Teacher controls' }).click()
    await page.getByLabel('Projector demo').check()
    await expect(page.getByLabel('First name')).toBeDisabled()
    await page.getByLabel('Class period').selectOption('2')
    await expect(page.getByRole('button', { name: 'Begin' })).toBeDisabled()
    await page.getByLabel('Type DEMO to confirm').fill('DEMO')
    await page.getByRole('button', { name: 'Begin' }).click()
    await expect(page.getByTestId('tutorial-screen')).toBeVisible()
    expect((await currentState(page)).identity).toEqual({ firstName: 'Demo Student', isDemo: true, period: '2' })
    issues.assertClean()
  })

  test('completes transcription, terminal Stop translation, wheel use, and function-row selection', async ({ page }) => {
    const issues = collectRuntimeIssues(page)
    await page.goto('/')
    await beginRun(page)

    await completeCurrentAction(page)
    expect((await currentState(page)).roundResults[0]).toMatchObject({ stage: 'transcription', correct: true })
    await continueAfterSuccess(page)

    const translation = await currentRound(page)
    expect(translation.type).toBe('translation')
    if (translation.type !== 'translation') return
    expect(translation.answers).toHaveLength(5)
    expect(translation.answers[4]).toBe('Stop')
    const wheel = page.getByTestId('codon-wheel')
    await expect(wheel).toBeVisible()
    await wheel.getByRole('button', { name: 'Enlarge codon wheel' }).click()
    await expect(wheel.getByRole('button', { name: 'Return codon wheel to normal size' })).toHaveAttribute('aria-pressed', 'true')
    await expect(wheel.getByRole('img')).toContainText(`The highlighted path begins with the active codon ${translation.codons[0]}`)

    await completeCurrentAction(page)
    const translated = (await currentState(page)).roundResults[1]
    expect(translated).toMatchObject({ stage: 'translation', correct: true })
    expect(translated.chain).toBe(translation.answers.slice(0, 4).join('-'))
    expect(translated.chain).not.toContain('Stop')
    await continueAfterSuccess(page)

    const functionRound = await currentRound(page)
    expect(functionRound.type).toBe('protein')
    const selected = await clickCorrectFunctionRow(page)
    await expect(selected).toHaveAttribute('aria-checked', 'true')
    await page.getByTestId('task-dock').getByRole('button', { name: 'Check Match' }).click()
    await expect(page.getByTestId('shipment-overlay').getByText('Protein product complete.')).toBeVisible()
    await expect(page.getByLabel('Completed protein comparison tray').getByText('Protein 1')).toBeVisible()
    expect((await currentState(page)).completedProducts).toHaveLength(1)
    issues.assertClean()
  })

  test('completes all nine actions, records both sequence outcomes and submits the V4 payload', async ({ page }) => {
    const issues = collectRuntimeIssues(page)
    let submittedAttempt: Record<string, any> | null = null
    await page.unroute('**/api/attempt')
    await page.route('**/api/attempt', async (route) => {
      submittedAttempt = (await route.request().postDataJSON()).attempt
      await route.fulfill({ body: JSON.stringify({ ok: true }), contentType: 'application/json', status: 200 })
    })
    await page.goto('/')
    await beginRun(page, { name: 'Payload Student', period: '4' })
    const initial = await currentState(page)

    for (let action = 0; action < 9; action += 1) {
      if (action === 3 || action === 4) {
        await expect(page.getByTestId('task-dock')).not.toContainText(/same chain|amino acid changed/i)
      }
      if (action === 3) {
        await expect(page.getByText('Complete the mRNA base beneath the highlighted DNA change.')).toBeVisible()
      }
      await completeCurrentAction(page)
      const state = await currentState(page)
      expect(state.roundResults).toHaveLength(action + 1)
      if (action === 5) {
        const [original, sameChain] = state.completedProducts
        expect(countDifferences(original.dnaStrand, sameChain.dnaStrand)).toBe(1)
        expect(sameChain.aminoAcidChain).toEqual(original.aminoAcidChain)
        expect(sameChain.functionRowId).toBe(original.functionRowId)
      }
      if (action === 8) {
        const [original, , changedChain] = state.completedProducts
        expect(countDifferences(original.dnaStrand, changedChain.dnaStrand)).toBe(1)
        expect(countArrayDifferences(original.aminoAcidChain, changedChain.aminoAcidChain)).toBe(1)
        expect(changedChain.functionRowId).not.toBe(original.functionRowId)
      }
      await continueAfterSuccess(page)
    }

    await expect(page.getByRole('heading', { name: 'Precision Production' })).toBeVisible()
    await expect(page.getByText('9/9 completed')).toBeVisible()
    await expect(page.locator('.independence-result')).toContainText('9/9 independently')
    await expect(page.locator('.independence-result')).toContainText('(100%)')
    await expect(page.getByRole('progressbar', { name: '100% independent' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Your three protein products' })).toBeVisible()
    await expect.poll(() => submittedAttempt).not.toBeNull()

    const payload = await readLatestPayload(page)
    expect(payload).toMatchObject({
      classPeriod: '4',
      factoryRating: 'Precision',
      independentStages: 9,
      schemaVersion: 'protein-factory-v4',
      score: 9,
      studentName: 'Payload Student',
      totalRounds: 9,
    })
    expect(payload?.stageResults).toHaveLength(9)
    expect(payload?.completedProducts).toHaveLength(3)
    expect(payload?.runManifest.sequenceIds).toHaveLength(3)
    expect(payload?.runManifest.effects).toEqual(['same-chain', 'amino-acid-change'])
    expect(submittedAttempt).toMatchObject({ schemaVersion: 'protein-factory-v4', score: 9, totalRounds: 9 })

    await page.getByRole('button', { name: 'Replay' }).click()
    await expect(page.getByTestId('factory-play')).toBeVisible()
    await expect(page.locator('.stage-score')).toContainText('0/9')
    const replay = await currentState(page)
    expect(replay.identity.firstName).toBe('Payload Student')
    expect(replay.attemptId).not.toBe(initial.attemptId)
    expect(replay.runManifest.familyId).not.toBe(initial.runManifest.familyId)
    expect(replay.roundResults).toEqual([])
    expect(replay.completedProducts).toEqual([])
    issues.assertClean()
  })

  test('treats rapid check taps as one committed action', async ({ page }) => {
    const issues = collectRuntimeIssues(page)
    await page.goto('/')
    await beginRun(page)
    const transcription = await currentRound(page)
    expect(transcription.type).toBe('transcription')
    if (transcription.type !== 'transcription') return

    for (const base of transcription.answer) {
      await page.getByTestId('task-dock').getByRole('button', { exact: true, name: base }).click()
    }
    await page.getByRole('button', { name: 'Check mRNA' }).click({ clickCount: 2, delay: 10 })
    await expect(page.getByTestId('shipment-overlay')).toBeVisible()
    expect((await currentState(page)).roundResults).toHaveLength(1)
    await page.getByTestId('shipment-overlay').getByRole('button', { name: 'Next action' }).click({ clickCount: 2, delay: 10 })

    const translation = await currentRound(page)
    expect(translation.type).toBe('translation')
    if (translation.type !== 'translation') return
    const choice = page.getByRole('group', { name: `Signals for ${translation.codons[0]}` })
      .getByRole('button', { exact: true, name: translation.answers[0] })
    await choice.click({ clickCount: 2, delay: 10 })
    await page.getByRole('button', { name: 'Check codon' }).click({ clickCount: 2, delay: 10 })
    await expect.poll(async () => (await currentState(page)).roundState.currentCodonIndex).toBe(1)
    const state = await currentState(page)
    expect(state.roundState.answers[0]).toBe(translation.answers[0])
    expect(state.roundState.attempts).toBe(1)
    issues.assertClean()
  })
})
