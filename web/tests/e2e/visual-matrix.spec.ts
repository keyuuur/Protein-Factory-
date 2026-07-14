import { expect, test } from '@playwright/test'
import {
  assertCanvasIsRendered,
  assertMinimumButtonSize,
  assertNoHorizontalOverflow,
  assertPrimaryActionIsInViewport,
  beginRun,
  capturePng,
  captureViewportPng,
  collectRuntimeIssues,
  completeCurrentAction,
  continueAfterSuccess,
  currentRound,
  currentState,
} from './helpers'

test('captures the complete pass-1 flow at the project viewport', async ({ page }, testInfo) => {
  const issues = collectRuntimeIssues(page)
  await page.route('**/api/attempt', (route) => route.fulfill({
    body: JSON.stringify({ ok: true }),
    contentType: 'application/json',
    status: 200,
  }))
  await page.goto('/')
  await capturePng(page, testInfo, 'pass-1-initial-full-page')
  await captureViewportPng(page, testInfo, 'pass-1-initial-viewport')
  await beginRun(page, { name: `Visual ${testInfo.project.name}` })

  await expect(page.getByRole('heading', { name: 'Build the mRNA' })).toBeVisible()
  await assertCanvasIsRendered(page)
  const transcription = await currentRound(page)
  expect(transcription.type).toBe('transcription')
  if (transcription.type !== 'transcription') return
  const dock = page.getByTestId('task-dock')
  await dock.getByRole('button', { exact: true, name: transcription.answer[0] }).click()
  await expect(dock.locator('[aria-label^="mRNA slot"]').first())
    .toHaveAttribute('aria-label', `mRNA slot 1, ${transcription.answer[0]}`)
  await captureViewportPng(page, testInfo, 'pass-1-selected-partial-viewport')

  const wrongBase = transcription.options.find((base) => base !== transcription.answer[1])!
  for (const base of `${wrongBase}${transcription.answer.slice(2)}`) {
    await dock.getByRole('button', { exact: true, name: base }).click()
  }
  await dock.getByRole('button', { name: 'Check mRNA' }).click()
  const repairState = await currentState(page)
  expect(repairState.roundState.repairTarget).toMatchObject({ kind: 'base', index: 1 })
  await expect(dock.locator('[aria-label^="mRNA slot"]').nth(1)).toHaveClass(/repair-target/)
  await captureViewportPng(page, testInfo, 'pass-1-wrong-repair-viewport')

  await dock.getByRole('button', { exact: true, name: transcription.answer[1] }).click()
  await dock.getByRole('button', { name: 'Check mRNA' }).click()
  await expect(page.getByTestId('shipment-overlay')).toBeVisible()
  await captureViewportPng(page, testInfo, 'pass-1-success-viewport')
  await continueAfterSuccess(page)

  const translation = await currentRound(page)
  expect(translation.type).toBe('translation')
  const viewport = page.viewportSize()
  if (viewport && viewport.width <= 820 && viewport.height > viewport.width) {
    await page.getByRole('button', { name: 'Open Codon Wheel' }).click()
    await assertMobileWheelIsVisibleAndSeparated(page)
  } else {
    await page.getByTestId('codon-wheel').getByRole('button', { name: 'Enlarge codon wheel' }).click()
  }
  if (viewport && viewport.width <= 820 && viewport.height > viewport.width) {
    await captureViewportPng(page, testInfo, 'pass-1-translation-wheel-viewport')
  } else {
    await capturePng(page, testInfo, 'pass-1-translation-wheel-full-page')
  }
  if (viewport && viewport.width <= 820 && viewport.height > viewport.width) {
    await page.getByRole('button', { name: 'Close codon wheel' }).click()
  }
  await assertMinimumButtonSize(page)
  await assertNoHorizontalOverflow(page)
  await completeCurrentAction(page)
  await continueAfterSuccess(page)

  await expect(page.getByRole('heading', { name: 'Function Test' })).toBeVisible()
  await assertMinimumButtonSize(page)
  await assertNoHorizontalOverflow(page)
  await capturePng(page, testInfo, 'pass-1-function-test-full-page')
  await completeCurrentAction(page)
  await captureViewportPng(page, testInfo, 'pass-1-transition-viewport')
  await continueAfterSuccess(page)

  for (let action = 3; action < 9; action += 1) {
    if (action === 3) await capturePng(page, testInfo, 'pass-1-variant-transcription-full-page')
    if (action === 5) await capturePng(page, testInfo, 'pass-1-variant-function-test-full-page')
    await completeCurrentAction(page)
    await continueAfterSuccess(page)
  }

  await expect(page.getByTestId('end-screen')).toBeVisible()
  await captureViewportPng(page, testInfo, 'pass-1-final-viewport')
  issues.assertClean()
})

test('keeps pass-1 gameplay controls usable at 1024x768', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'Desktop Chromium owns the 1024x768 layout gate.')
  await page.setViewportSize({ width: 1024, height: 768 })
  await page.goto('/')
  await assertNoHorizontalOverflow(page)
  await assertMinimumButtonSize(page)
  await assertPrimaryActionIsInViewport(page)

  await beginRun(page, { name: 'Layout Student' })
  await assertCanvasIsRendered(page)
  await assertNoHorizontalOverflow(page)
  await assertMinimumButtonSize(page)
  await assertPrimaryActionIsInViewport(page)
})

async function assertMobileWheelIsVisibleAndSeparated(page: Parameters<typeof beginRun>[0]) {
  const dialog = page.getByTestId('codon-wheel-dialog')
  await expect(dialog).toBeVisible()
  const boxes = await dialog.evaluate((element) => {
    const bounds = element.getBoundingClientRect()
    const close = element.querySelector<HTMLElement>('[data-wheel-close]')?.getBoundingClientRect()
    const viewport = element.querySelector<HTMLElement>('[data-testid="codon-wheel-viewport"]')?.getBoundingClientRect()
    const key = element.querySelector<HTMLElement>('.wheel-ring-key')?.getBoundingClientRect()
    return {
      bottom: bounds.bottom,
      closeBottom: close?.bottom ?? 0,
      keyBottom: key?.bottom ?? 0,
      keyTop: key?.top ?? 0,
      left: bounds.left,
      right: bounds.right,
      top: bounds.top,
      viewportBottom: viewport?.bottom ?? 0,
      viewportTop: viewport?.top ?? 0,
      visualHeight: window.visualViewport?.height ?? window.innerHeight,
      visualWidth: window.visualViewport?.width ?? window.innerWidth,
    }
  })
  expect(boxes.left).toBeGreaterThanOrEqual(0)
  expect(boxes.top).toBeGreaterThanOrEqual(0)
  expect(boxes.right).toBeLessThanOrEqual(boxes.visualWidth + 1)
  expect(boxes.bottom).toBeLessThanOrEqual(boxes.visualHeight + 1)
  expect(boxes.viewportTop).toBeGreaterThanOrEqual(boxes.closeBottom - 1)
  expect(boxes.keyTop).toBeGreaterThanOrEqual(boxes.viewportBottom - 1)
  expect(boxes.keyBottom).toBeLessThanOrEqual(boxes.bottom + 1)
}
