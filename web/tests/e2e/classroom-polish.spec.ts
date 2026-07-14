import { expect, test, type Locator } from '@playwright/test'
import {
  assertMinimumButtonSize,
  assertNoHorizontalOverflow,
  beginRun,
  completeCurrentAction,
  continueAfterSuccess,
  currentRound,
} from './helpers'

test.describe('classroom interaction polish', () => {
  test('primary controls stay put and usable after corrective feedback', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-chromium', 'Desktop Chromium owns feedback geometry checks.')
    await page.goto('/')
    await beginRun(page, { name: 'Feedback Geometry' })
    const dock = page.getByTestId('task-dock')

    const transcription = await currentRound(page)
    expect(transcription.type).toBe('transcription')
    if (transcription.type !== 'transcription') return
    const wrongBase = transcription.options.find((base) => base !== transcription.answer[0])!
    for (const base of `${wrongBase}${transcription.answer.slice(1)}`) {
      await dock.getByRole('button', { exact: true, name: base }).click()
    }
    const checkMrna = dock.getByRole('button', { name: 'Check mRNA' })
    await assertStableAfterFeedback(checkMrna, async () => checkMrna.click())
    await dock.getByRole('button', { exact: true, name: transcription.answer[0] }).click()
    await checkMrna.click()
    await continueAfterSuccess(page)

    const translation = await currentRound(page)
    expect(translation.type).toBe('translation')
    if (translation.type !== 'translation') return
    const wrongSignal = translation.codonChoices[0].find((signal) => signal !== translation.answers[0])!
    await dock.getByRole('group', { name: `Signals for ${translation.codons[0]}` })
      .getByRole('button', { exact: true, name: wrongSignal }).click()
    const checkCodon = dock.getByRole('button', { name: 'Check codon' })
    await assertStableAfterFeedback(checkCodon, async () => checkCodon.click())

    await completeCurrentAction(page)
    await continueAfterSuccess(page)
    const protein = await currentRound(page)
    expect(protein.type).toBe('protein')
    if (protein.type !== 'protein') return
    const wrongRow = protein.referenceRows.find((row) => row.id !== protein.correctRowId)!
    const wrongRadio = dock.getByRole('radio').filter({ hasText: wrongRow.aminoAcidSequence.join(' - ') })
    await wrongRadio.click()
    const checkMatch = dock.getByRole('button', { name: 'Check Match' })
    await assertStableAfterFeedback(checkMatch, async () => checkMatch.click())
  })

  test('reduced motion settles each user-caused render immediately', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-chromium', 'Desktop Chromium owns render-state causality checks.')
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.goto('/')
    await beginRun(page, { name: 'Reduced Motion' })
    const canvas = page.getByTestId('factory-canvas')
    await expect(canvas).toHaveAttribute('data-render-phase', 'settled')
    const revision = Number(await canvas.getAttribute('data-render-revision'))

    const round = await currentRound(page)
    expect(round.type).toBe('transcription')
    if (round.type !== 'transcription') return
    await page.getByTestId('task-dock').getByRole('button', { exact: true, name: round.answer[0] }).click()

    await expect.poll(async () => Number(await canvas.getAttribute('data-render-revision'))).toBeGreaterThan(revision)
    await expect(canvas).toHaveAttribute('data-render-phase', 'settled')
    await expect(canvas).toHaveAttribute('data-render-settled', 'true')
    await expect(canvas).toHaveAttribute('data-render-frame-revision', await canvas.getAttribute('data-render-revision') ?? '')
  })

  test('320 by 568 keeps gameplay controls on-screen and touchable without phantom width', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'phone-portrait', 'The phone project owns the narrow classroom viewport.')
    await page.setViewportSize({ width: 320, height: 568 })
    await page.goto('/')
    await assertNoHorizontalOverflow(page)
    await page.getByLabel('First name').fill('Narrow Phone')
    await page.getByLabel('Class period').selectOption('3')
    await assertMinimumButtonSize(page)
    await page.getByRole('button', { name: 'Begin' }).tap()
    await assertNoHorizontalOverflow(page)
    await assertMinimumButtonSize(page)
    await page.getByRole('button', { name: 'Start Protein 1' }).tap()
    await assertNoHorizontalOverflow(page)
    await assertMinimumButtonSize(page)

    await completeCurrentAction(page)
    await page.getByTestId('shipment-overlay').getByRole('button').tap()
    await page.getByRole('button', { name: 'Open Codon Wheel' }).tap()
    await expect(page.getByTestId('codon-wheel-dialog')).toBeVisible()
    await assertNoHorizontalOverflow(page)
    await assertMinimumButtonSize(page)
    await page.getByRole('button', { name: 'Close codon wheel' }).tap()
    await expect(page.getByRole('button', { name: 'Open Codon Wheel' })).toBeFocused()

    const widthState = await page.evaluate(() => ({
      bodyWidth: Math.round(document.body.getBoundingClientRect().width),
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
    }))
    expect(widthState).toEqual({ bodyWidth: 320, clientWidth: 320, scrollWidth: 320 })
  })
})

async function assertStableAfterFeedback(control: Locator, causeFeedback: () => Promise<void>) {
  const before = await control.boundingBox()
  expect(before).not.toBeNull()
  await causeFeedback()
  await expect(control).toBeVisible()
  await expect(control).toBeEnabled()
  const after = await control.boundingBox()
  expect(after).not.toBeNull()
  expect(after?.x).toBeCloseTo(before?.x ?? 0, 0)
  expect(after?.y).toBeCloseTo(before?.y ?? 0, 0)
  expect(after?.width).toBeCloseTo(before?.width ?? 0, 0)
  expect(after?.height).toBeCloseTo(before?.height ?? 0, 0)
}
