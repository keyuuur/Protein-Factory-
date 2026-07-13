import { expect, test } from '@playwright/test'
import {
  assertCanvasIsRendered,
  beginRun,
  capturePng,
  collectRuntimeIssues,
  completeCurrentAction,
  continueAfterSuccess,
  currentRound,
} from './helpers'

test('captures the complete V4 flow at the project viewport', async ({ page }, testInfo) => {
  const issues = collectRuntimeIssues(page)
  await page.route('**/api/attempt', (route) => route.fulfill({
    body: JSON.stringify({ ok: true }),
    contentType: 'application/json',
    status: 200,
  }))
  await page.goto('/')
  await beginRun(page, { name: `Visual ${testInfo.project.name}` })

  await expect(page.getByRole('heading', { name: 'Build the mRNA' })).toBeVisible()
  await assertCanvasIsRendered(page)
  await capturePng(page, testInfo, 'transcription')
  await completeCurrentAction(page)
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
  await capturePng(page, testInfo, 'translation-wheel')
  if (viewport && viewport.width <= 820 && viewport.height > viewport.width) {
    await page.getByRole('button', { name: 'Close codon wheel' }).click()
  }
  await completeCurrentAction(page)
  await continueAfterSuccess(page)

  await expect(page.getByRole('heading', { name: 'Function Test' })).toBeVisible()
  await capturePng(page, testInfo, 'function-test')
  await completeCurrentAction(page)
  await capturePng(page, testInfo, 'transition-comparison')
  await continueAfterSuccess(page)

  for (let action = 3; action < 9; action += 1) {
    await completeCurrentAction(page)
    await continueAfterSuccess(page)
  }

  await expect(page.getByTestId('end-screen')).toBeVisible()
  await capturePng(page, testInfo, 'final')
  issues.assertClean()
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
