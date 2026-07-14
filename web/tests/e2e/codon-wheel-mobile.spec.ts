import { expect, test } from '@playwright/test'
import { assertNoHorizontalOverflow, beginRun, completeCurrentAction, continueAfterSuccess, currentRound } from './helpers'

async function reachTranslation(page: Parameters<typeof beginRun>[0]) {
  await page.goto('/')
  await beginRun(page)
  await completeCurrentAction(page)
  await continueAfterSuccess(page)
  const round = await currentRound(page)
  expect(round.type).toBe('translation')
  return round
}

test('mobile codon wheel is modal, pannable, focus-safe, and scroll-locked', async ({ page }, testInfo) => {
  test.skip((testInfo.project.use.viewport?.width ?? 0) > 900, 'Mobile wheel behavior applies at 900px and below.')
  const round = await reachTranslation(page)
  const launch = page.getByRole('button', { name: 'Open Codon Wheel' })

  await expect(launch).toBeVisible()
  await expect.poll(async () => launch.evaluate((button) => button.getBoundingClientRect().height)).toBeGreaterThanOrEqual(48)
  await launch.focus()
  await launch.click()

  const dialog = page.getByTestId('codon-wheel-dialog')
  const wheel = page.getByTestId('codon-wheel')
  const viewport = page.getByTestId('codon-wheel-viewport')
  const close = dialog.getByRole('button', { name: 'Close codon wheel' })
  await expect(dialog).toBeVisible()
  await expect(wheel).toHaveAttribute('data-presentation', 'dialog')
  await expect(wheel).toHaveAttribute('data-active-codon', round.type === 'translation' ? round.codons[0] : '')
  await expect(wheel.locator('[data-active="true"]')).toHaveCount(3)
  await expect(close).toBeFocused()
  await expect.poll(async () => close.evaluate((button) => button.getBoundingClientRect().height)).toBeGreaterThanOrEqual(48)
  await expect.poll(() => page.evaluate(() => document.body.style.position)).toBe('fixed')
  await expect.poll(() => page.evaluate(() => document.documentElement.style.overflow)).toBe('hidden')
  await assertDialogLayout(page)

  const viewportMetrics = await viewport.evaluate((element) => {
    const svg = element.querySelector('svg')
    return {
      clientWidth: element.clientWidth,
      overflowX: getComputedStyle(element).overflowX,
      scrollWidth: element.scrollWidth,
      svgWidth: svg?.getBoundingClientRect().width ?? 0,
    }
  })
  expect(viewportMetrics.overflowX).toBe('auto')
  expect(viewportMetrics.svgWidth).toBe(560)
  if (viewportMetrics.scrollWidth > viewportMetrics.clientWidth) {
    await viewport.evaluate((element) => { element.scrollLeft = 120 })
    await expect.poll(() => viewport.evaluate((element) => element.scrollLeft)).toBeGreaterThan(0)
  }
  await page.mouse.click(2, 2)
  await expect(dialog).toBeVisible()

  await page.keyboard.press('Tab')
  await expect(viewport).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(close).toBeFocused()
  await page.keyboard.press('Shift+Tab')
  await expect(viewport).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(close).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
  await expect(launch).toBeFocused()
  await expect.poll(() => page.evaluate(() => document.body.style.position)).toBe('')
})

test('mobile codon wheel uses the accessible fallback when native dialog is unavailable', async ({ page }, testInfo) => {
  test.skip((testInfo.project.use.viewport?.width ?? 0) > 900, 'Mobile wheel behavior applies at 900px and below.')
  test.skip(testInfo.project.name !== 'phone-portrait', 'One mobile project is enough to cover the fallback.')
  await page.addInitScript(() => {
    Object.defineProperty(HTMLDialogElement.prototype, 'showModal', { configurable: true, value: undefined })
  })
  await reachTranslation(page)
  await page.getByRole('button', { name: 'Open Codon Wheel' }).click()

  const dialog = page.getByTestId('codon-wheel-dialog')
  await expect(dialog).toHaveAttribute('data-dialog-kind', 'fallback')
  await expect(dialog).toHaveAttribute('role', 'dialog')
  await expect(dialog).toHaveAttribute('aria-modal', 'true')
  await expect(page.locator('#root')).toHaveAttribute('inert', '')
  await expect(page.locator('#root')).toHaveAttribute('aria-hidden', 'true')
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
  await expect(page.locator('#root')).not.toHaveAttribute('inert', '')
  await expect(page.locator('#root')).not.toHaveAttribute('aria-hidden', 'true')
  await expect(page.getByRole('button', { name: 'Open Codon Wheel' })).toBeFocused()
})

test('open mobile wheel closes cleanly when rotation crosses the presentation breakpoint', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'phone-portrait', 'One mobile project is enough to cover breakpoint rotation.')
  await page.setViewportSize({ width: 900, height: 700 })
  await reachTranslation(page)
  await page.getByRole('button', { name: 'Open Codon Wheel' }).click()
  await expect(page.getByTestId('codon-wheel-dialog')).toBeVisible()

  await page.setViewportSize({ width: 901, height: 700 })

  await expect(page.getByTestId('codon-wheel-dialog')).toHaveCount(0)
  const inlineWheel = page.getByTestId('codon-wheel')
  await expect(inlineWheel).toHaveAttribute('data-presentation', 'inline')
  await expect(inlineWheel).toHaveAttribute('data-open', 'false')
  await expect(inlineWheel.getByRole('button', { name: 'Enlarge codon wheel' })).toBeFocused()
  await expect.poll(() => page.evaluate(() => document.body.style.position)).toBe('')
})

test('active codon, page scroll, and focus survive wheel use and mobile rotation', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'phone-portrait', 'One mobile project is enough to cover rotation state restoration.')
  await page.setViewportSize({ width: 390, height: 568 })
  const round = await reachTranslation(page)
  if (round.type !== 'translation') return

  const dock = page.getByTestId('task-dock')
  const firstChoice = dock.getByRole('group', { name: `Signals for ${round.codons[0]}` })
    .getByRole('button', { exact: true, name: round.answers[0] })
  await firstChoice.click()
  await dock.getByRole('button', { name: 'Check codon' }).click()
  const secondCodon = dock.locator('.codon-selector button').nth(1)
  await expect(secondCodon).toHaveAttribute('aria-current', 'step')

  await page.mouse.wheel(0, 900)
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0)
  const scrollBeforeOpen = await page.evaluate(() => window.scrollY)
  const launch = page.getByRole('button', { name: 'Open Codon Wheel' })
  await launch.click()

  const dialog = page.getByTestId('codon-wheel-dialog')
  const wheel = page.getByTestId('codon-wheel')
  await expect(wheel).toHaveAttribute('data-active-codon', round.codons[1])
  await expect(wheel.locator(`[data-ring="third-signal"][data-codon="${round.codons[1]}"]`)).toHaveAttribute('data-active', 'true')
  await page.setViewportSize({ width: 568, height: 390 })
  await expect(dialog).toBeVisible()
  await assertDialogLayout(page)
  await page.setViewportSize({ width: 390, height: 568 })
  await expect(dialog).toBeVisible()
  await assertDialogLayout(page)
  await page.keyboard.press('Escape')

  await expect(dialog).toBeHidden()
  await expect(launch).toBeFocused()
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0)
  const restoredScroll = await page.evaluate(() => window.scrollY)
  expect(restoredScroll).toBeLessThanOrEqual(scrollBeforeOpen)
  expect(scrollBeforeOpen - restoredScroll).toBeLessThanOrEqual(80)
  await expect(launch).toBeInViewport()
  await expect.poll(() => page.evaluate(() => document.body.style.position)).toBe('')
  await assertNoHorizontalOverflow(page)

  const geometry = await page.evaluate(() => ({
    bodyBottom: Math.round(document.body.getBoundingClientRect().bottom + window.scrollY),
    documentHeight: document.documentElement.scrollHeight,
    fixedTop: document.body.style.top,
    viewportHeight: window.innerHeight,
  }))
  expect(geometry.fixedTop).toBe('')
  expect(Math.abs(geometry.documentHeight - geometry.bodyBottom)).toBeLessThanOrEqual(1)
  expect(geometry.documentHeight).toBeGreaterThanOrEqual(geometry.viewportHeight)
})

async function assertDialogLayout(page: Parameters<typeof beginRun>[0]) {
  const layout = await page.getByTestId('codon-wheel-dialog').evaluate((dialog) => {
    const panel = dialog.querySelector<HTMLElement>('[data-testid="codon-wheel"]')
    const close = dialog.querySelector<HTMLElement>('[data-wheel-close]')
    const viewport = dialog.querySelector<HTMLElement>('[data-testid="codon-wheel-viewport"]')
    const key = dialog.querySelector<HTMLElement>('.wheel-ring-key')
    const bounds = dialog.getBoundingClientRect()
    const panelBounds = panel?.getBoundingClientRect()
    const closeBounds = close?.getBoundingClientRect()
    const viewportBounds = viewport?.getBoundingClientRect()
    const keyBounds = key?.getBoundingClientRect()
    return {
      bottom: bounds.bottom,
      closeBottom: closeBounds?.bottom ?? 0,
      height: bounds.height,
      keyBottom: keyBounds?.bottom ?? 0,
      keyTop: keyBounds?.top ?? 0,
      left: bounds.left,
      panelBottom: panelBounds?.bottom ?? 0,
      panelTop: panelBounds?.top ?? 0,
      right: bounds.right,
      top: bounds.top,
      viewportBottom: viewportBounds?.bottom ?? 0,
      viewportHeight: viewportBounds?.height ?? 0,
      viewportTop: viewportBounds?.top ?? 0,
      visualHeight: window.visualViewport?.height ?? window.innerHeight,
      visualWidth: window.visualViewport?.width ?? window.innerWidth,
      width: bounds.width,
    }
  })

  expect(layout.width).toBeGreaterThan(0)
  expect(layout.height).toBeGreaterThan(0)
  expect(layout.left).toBeGreaterThanOrEqual(0)
  expect(layout.top).toBeGreaterThanOrEqual(0)
  expect(layout.right).toBeLessThanOrEqual(layout.visualWidth + 1)
  expect(layout.bottom).toBeLessThanOrEqual(layout.visualHeight + 1)
  expect(layout.panelTop).toBeGreaterThanOrEqual(layout.top - 1)
  expect(layout.panelBottom).toBeLessThanOrEqual(layout.bottom + 1)
  expect(layout.viewportHeight).toBeGreaterThan(0)
  expect(layout.viewportTop).toBeGreaterThanOrEqual(layout.closeBottom - 1)
  expect(layout.keyTop).toBeGreaterThanOrEqual(layout.viewportBottom - 1)
  expect(layout.keyBottom).toBeLessThanOrEqual(layout.panelBottom + 1)
}
