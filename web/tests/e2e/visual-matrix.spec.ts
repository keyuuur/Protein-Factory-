import { expect, test } from '@playwright/test'
import {
  assertCanvasIsRendered,
  assertMinimumButtonSize,
  assertNoHorizontalOverflow,
  assertPrimaryActionIsInViewport,
  beginRun,
  capturePng,
  captureViewportPng,
  clickCorrectFunctionRow,
  collectRuntimeIssues,
  completeCurrentAction,
  continueAfterSuccess,
  currentRound,
  currentState,
} from './helpers'

const visualPass = process.env.VISUAL_PASS || 'pass-1'

test('captures the complete pass-1 flow at the project viewport', async ({ page }, testInfo) => {
  const issues = collectRuntimeIssues(page)
  await page.route('**/api/attempt', (route) => route.fulfill({
    body: JSON.stringify({ ok: true }),
    contentType: 'application/json',
    status: 200,
  }))
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Protein Factory' })).toBeVisible()
  await capturePng(page, testInfo, `${visualPass}-initial-full-page`)
  await captureViewportPng(page, testInfo, `${visualPass}-initial-viewport`)
  await beginRun(page, { name: `Visual ${testInfo.project.name}` })

  await expect(page.getByRole('heading', { name: 'Build the mRNA' })).toBeVisible()
  await assertCanvasIsRendered(page)
  const transcription = await currentRound(page)
  expect(transcription.type).toBe('transcription')
  if (transcription.type !== 'transcription') return
  const dock = page.getByTestId('task-dock')
  await armRendererReactionTimer(page)
  await dock.getByRole('button', { exact: true, name: transcription.answer[0] }).click()
  await expectRendererReactionWithin(page, 150)
  await expect(dock.locator('[aria-label^="mRNA slot"]').first())
    .toHaveAttribute('aria-label', `mRNA slot 1, ${transcription.answer[0]}`)
  await captureViewportPng(page, testInfo, `${visualPass}-selected-partial-viewport`)

  const wrongBase = transcription.options.find((base) => base !== transcription.answer[1])!
  for (const base of `${wrongBase}${transcription.answer.slice(2)}`) {
    await dock.getByRole('button', { exact: true, name: base }).click()
  }
  await dock.getByRole('button', { name: 'Check mRNA' }).click()
  const repairState = await currentState(page)
  expect(repairState.roundState.repairTarget).toMatchObject({ kind: 'base', index: 1 })
  await expect(dock.locator('[aria-label^="mRNA slot"]').nth(1)).toHaveClass(/repair-target/)
  await captureViewportPng(page, testInfo, `${visualPass}-wrong-repair-viewport`)

  await dock.getByRole('button', { exact: true, name: transcription.answer[1] }).click()
  await dock.getByRole('button', { name: 'Check mRNA' }).click()
  await expect(page.getByTestId('shipment-overlay')).toBeVisible()
  await captureViewportPng(page, testInfo, `${visualPass}-success-viewport`)
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
    await captureViewportPng(page, testInfo, `${visualPass}-translation-wheel-viewport`)
  } else {
    await capturePng(page, testInfo, `${visualPass}-translation-wheel-full-page`)
  }
  if (viewport && viewport.width <= 820 && viewport.height > viewport.width) {
    await page.getByRole('button', { name: 'Close codon wheel' }).click()
  }
  await assertMinimumButtonSize(page)
  await assertNoHorizontalOverflow(page)
  const translationDock = page.getByTestId('task-dock')
  for (let index = 0; index < translation.answers.length; index += 1) {
    await armRendererReactionTimer(page)
    await translationDock.getByRole('group', { name: `Signals for ${translation.codons[index]}` })
      .getByRole('button', { exact: true, name: translation.answers[index] })
      .click()
    await expectRendererReactionWithin(page, 150)
    if (index === 0) await captureViewportPng(page, testInfo, `${visualPass}-translation-pending-viewport`)
    if (index === translation.answers.length - 1) await captureViewportPng(page, testInfo, `${visualPass}-stop-signal-viewport`)
    await translationDock.getByRole('button', { name: 'Check codon' }).click()
    if (index === 0) await captureViewportPng(page, testInfo, `${visualPass}-translation-linked-viewport`)
  }
  await expect(page.getByTestId('shipment-overlay')).toBeVisible()
  await continueAfterSuccess(page)

  await expect(page.getByRole('heading', { name: 'Function Test' })).toBeVisible()
  await assertMinimumButtonSize(page)
  await assertNoHorizontalOverflow(page)
  await capturePng(page, testInfo, `${visualPass}-function-test-full-page`)
  await armRendererReactionTimer(page)
  await clickCorrectFunctionRow(page)
  await expectRendererReactionWithin(page, 150)
  await captureViewportPng(page, testInfo, `${visualPass}-function-preview-viewport`)
  await page.getByTestId('task-dock').getByRole('button', { name: 'Check Match' }).click()
  await expect(page.getByTestId('shipment-overlay')).toBeVisible()
  await captureViewportPng(page, testInfo, `${visualPass}-transition-viewport`)
  await continueAfterSuccess(page)

  for (let action = 3; action < 9; action += 1) {
    if (action === 3) await capturePng(page, testInfo, `${visualPass}-variant-transcription-full-page`)
    if (action === 5) await capturePng(page, testInfo, `${visualPass}-variant-function-test-full-page`)
    await completeCurrentAction(page)
    await continueAfterSuccess(page)
  }

  await expect(page.getByTestId('end-screen')).toBeVisible()
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0)
  await expect(page.getByRole('heading', { name: /production/i }).first()).toBeInViewport()
  await captureViewportPng(page, testInfo, `${visualPass}-final-viewport`)
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

async function armRendererReactionTimer(page: Parameters<typeof beginRun>[0]) {
  await page.evaluate(() => {
    const host = document.querySelector<HTMLElement>('[data-testid="factory-canvas"]')
    if (!host) throw new Error('Factory renderer host is missing.')
    const marker = '__proteinFactoryReactionMs'
    ;(window as unknown as Record<string, number | null>)[marker] = null
    let startedAt = 0
    document.addEventListener('pointerdown', () => { startedAt = performance.now() }, { capture: true, once: true })
    const observer = new MutationObserver(() => {
      if (startedAt === 0) return
      ;(window as unknown as Record<string, number | null>)[marker] = performance.now() - startedAt
      observer.disconnect()
    })
    observer.observe(host, { attributeFilter: ['data-render-frame-revision'], attributes: true })
  })
}

async function expectRendererReactionWithin(page: Parameters<typeof beginRun>[0], maximumMs: number) {
  const handle = await page.waitForFunction(() => {
    const value = (window as unknown as Record<string, number | null>).__proteinFactoryReactionMs
    return typeof value === 'number' ? value : false
  }, undefined, { timeout: 1_000 })
  const reactionMs = await handle.jsonValue()
  expect(reactionMs, `renderer should react within ${maximumMs}ms`).toBeLessThanOrEqual(maximumMs)
}
