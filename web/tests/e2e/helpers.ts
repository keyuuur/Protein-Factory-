import { mkdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { expect, type Locator, type Page, type TestInfo } from '@playwright/test'
import { PNG } from 'pngjs'
import type { FinalGamePayload, GameRound, GameSessionState } from '../../src/types'

const checkpointKey = 'pirate-protein-factory:last-checkpoint'
const historyKey = 'pirate-protein-factory:payload-history'
const screenshotDirectory = path.resolve(process.cwd(), '../output/playwright')

export interface RuntimeIssues {
  assertClean: () => void
  consoleErrors: string[]
  pageErrors: string[]
}

export function collectRuntimeIssues(page: Page): RuntimeIssues {
  const consoleErrors: string[] = []
  const pageErrors: string[] = []

  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text())
  })
  page.on('pageerror', (error) => pageErrors.push(error.message))

  return {
    consoleErrors,
    pageErrors,
    assertClean: () => {
      expect(consoleErrors, 'browser console errors').toEqual([])
      expect(pageErrors, 'uncaught page errors').toEqual([])
    },
  }
}

export async function beginRun(
  page: Page,
  options: { demo?: boolean; name?: string; period?: string } = {},
) {
  const { demo = false, name = 'Test Student', period = '3' } = options
  await page.getByLabel('Class period').selectOption(period)

  if (demo) {
    await page.locator('summary').filter({ hasText: 'Teacher controls' }).click()
    await page.getByLabel('Projector demo').check()
    await page.getByLabel('Type DEMO to confirm').fill('DEMO')
  } else {
    await page.getByLabel('First name').fill(name)
  }

  await page.getByRole('button', { name: 'Begin' }).click()
  await expect(page.getByTestId('tutorial-screen')).toBeVisible()
  await page.getByRole('button', { name: 'Start Protein 1' }).click()
  await expect(page.getByTestId('task-dock')).toBeVisible()
  await expect.poll(() => readCheckpoint(page)).not.toBeNull()
}

export async function readCheckpoint(page: Page): Promise<GameSessionState | null> {
  return page.evaluate((key) => {
    try {
      const raw = localStorage.getItem(key)
      return raw ? JSON.parse(raw).state ?? null : null
    } catch {
      return null
    }
  }, checkpointKey)
}

export async function currentState(page: Page): Promise<GameSessionState> {
  await expect.poll(async () => (await readCheckpoint(page))?.screen).toBeTruthy()
  const state = await readCheckpoint(page)
  if (!state) throw new Error('Expected a V4 checkpoint, but none was readable.')
  return state
}

export async function currentRound(page: Page): Promise<GameRound> {
  const state = await currentState(page)
  const round = state.runManifest.rounds[state.currentRoundIndex]
  if (!round) throw new Error(`Missing round at index ${state.currentRoundIndex}.`)
  return round
}

export async function completeCurrentAction(page: Page): Promise<GameSessionState> {
  const round = await currentRound(page)
  const dock = page.getByTestId('task-dock')

  if (round.type === 'transcription') {
    for (const [index, base] of [...round.answer].entries()) {
      const slot = dock.locator('[aria-label^="mRNA slot"]').nth(index)
      const slotLabel = await slot.getAttribute('aria-label')
      if (slotLabel === `mRNA slot ${index + 1}, ${base}`) continue

      const button = dock.getByRole('button', { exact: true, name: base })
      await button.click()
      try {
        await expect(slot).toHaveAttribute('aria-label', `mRNA slot ${index + 1}, ${base}`, { timeout: 1_500 })
      } catch {
        await button.click()
        await expect(slot).toHaveAttribute('aria-label', `mRNA slot ${index + 1}, ${base}`)
      }
    }
    await dock.getByRole('button', { name: 'Check mRNA' }).click()
  } else if (round.type === 'translation') {
    const state = await currentState(page)
    for (let index = 0; index < round.answers.length; index += 1) {
      if (state.roundState.answers[index] === round.answers[index]) continue
      const answer = round.answers[index]
      await dock.getByRole('group', { name: `Signals for ${round.codons[index]}` })
        .getByRole('button', { exact: true, name: answer })
        .click()
      await dock.getByRole('button', { name: 'Check codon' }).click()
    }
  } else {
    const correctRow = dock.getByRole('radio').filter({
      hasText: round.referenceRows.find((row) => row.id === round.correctRowId)?.aminoAcidSequence.join(' - '),
    })
    await correctRow.click()
    await expect(correctRow).toHaveAttribute('aria-checked', 'true')
    await dock.getByRole('button', { name: 'Check Match' }).click()
  }

  await expect(page.getByTestId('shipment-overlay')).toBeVisible()
  return currentState(page)
}

export async function continueAfterSuccess(page: Page): Promise<GameSessionState | null> {
  const overlay = page.getByTestId('shipment-overlay')
  await overlay.getByRole('button').click()
  await expect(overlay).toBeHidden()
  if (await page.getByTestId('end-screen').isVisible()) return null
  return currentState(page)
}

export async function completeProtein(page: Page): Promise<GameSessionState> {
  for (let action = 0; action < 3; action += 1) {
    await completeCurrentAction(page)
    if (action < 2) await continueAfterSuccess(page)
  }
  return currentState(page)
}

export async function completeRun(page: Page): Promise<void> {
  for (let action = 0; action < 9; action += 1) {
    await completeCurrentAction(page)
    await continueAfterSuccess(page)
  }
  await expect(page.getByTestId('end-screen')).toBeVisible()
}

export async function readLatestPayload(page: Page): Promise<FinalGamePayload | null> {
  return page.evaluate((key) => {
    try {
      const history = JSON.parse(localStorage.getItem(key) || '[]')
      return Array.isArray(history) ? history[0] ?? null : null
    } catch {
      return null
    }
  }, historyKey)
}

export async function assertNoHorizontalOverflow(page: Page) {
  const dimensions = await page.evaluate(() => {
    const clippedControls = [...document.querySelectorAll<HTMLElement>('button, [role="radio"], input, select')]
      .filter((element) => {
        const style = getComputedStyle(element)
        if (style.display === 'none' || style.visibility === 'hidden') return false
        const bounds = element.getBoundingClientRect()
        return bounds.width > 0 && bounds.height > 0 && (bounds.left < -1 || bounds.right > window.innerWidth + 1)
      })
      .map((element) => ({
        left: Math.round(element.getBoundingClientRect().left),
        name: element.getAttribute('aria-label') ?? element.textContent?.trim().slice(0, 80) ?? element.tagName,
        right: Math.round(element.getBoundingClientRect().right),
      }))
    return {
      clientWidth: document.documentElement.clientWidth,
      clippedControls,
      innerWidth: window.innerWidth,
      scrollWidth: document.documentElement.scrollWidth,
    }
  })
  expect(dimensions.scrollWidth, JSON.stringify(dimensions)).toBeLessThanOrEqual(dimensions.innerWidth + 1)
  expect(dimensions.clippedControls, `interactive controls must fit the viewport: ${JSON.stringify(dimensions)}`).toEqual([])
}

export async function assertMinimumButtonSize(page: Page, minimum = 48) {
  const undersized = await page.locator('button:visible').evaluateAll((buttons, expectedMinimum) => buttons
    .map((button) => {
      const bounds = button.getBoundingClientRect()
      const style = getComputedStyle(button)
      return {
        computedHeight: style.height,
        computedMinHeight: style.minHeight,
        height: bounds.height,
        name: button.getAttribute('aria-label') ?? button.textContent?.trim() ?? '(unnamed button)',
        width: bounds.width,
      }
    })
    .filter(({ height, width }) => height + 0.5 < expectedMinimum || width + 0.5 < expectedMinimum), minimum)

  expect(undersized, `visible buttons should be at least ${minimum}px in both dimensions`).toEqual([])
}

export async function assertPrimaryActionIsInViewport(page: Page) {
  const primaryAction = page.locator('.primary-action:visible').first()
  await expect(primaryAction).toBeVisible()
  const bounds = await primaryAction.evaluate((element) => {
    const rect = element.getBoundingClientRect()
    return {
      bottom: rect.bottom,
      left: rect.left,
      right: rect.right,
      top: rect.top,
      viewportHeight: window.visualViewport?.height ?? window.innerHeight,
      viewportWidth: window.visualViewport?.width ?? window.innerWidth,
    }
  })
  expect(bounds.left, JSON.stringify(bounds)).toBeGreaterThanOrEqual(-0.5)
  expect(bounds.top, JSON.stringify(bounds)).toBeGreaterThanOrEqual(-0.5)
  expect(bounds.right, JSON.stringify(bounds)).toBeLessThanOrEqual(bounds.viewportWidth + 0.5)
  expect(bounds.bottom, JSON.stringify(bounds)).toBeLessThanOrEqual(bounds.viewportHeight + 0.5)
}

export async function assertRendererSettled(page: Page) {
  const host = page.getByTestId('factory-canvas')
  await expect(host).toHaveAttribute('data-render-settled', 'true', { timeout: 3_000 })
  await expect(host).toHaveAttribute('data-render-phase', 'settled')

  const settledRevision = await host.getAttribute('data-render-revision')
  expect(settledRevision).toMatch(/^\d+$/)
  await page.evaluate(() => new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
  }))
  await expect(host).toHaveAttribute('data-render-settled', 'true')
  await expect(host).toHaveAttribute('data-render-phase', 'settled')
  await expect(host).toHaveAttribute('data-render-revision', settledRevision!)
}

export async function assertCanvasIsRendered(page: Page) {
  const host = page.getByTestId('factory-canvas')
  await assertRendererSettled(page)
  const canvas = host.locator('canvas')
  await expect(canvas).toBeVisible()
  const buffer = await canvas.screenshot()
  const png = PNG.sync.read(buffer)
  const total = png.width * png.height
  let nearBlack = 0
  let colored = 0
  let transparent = 0

  for (let index = 0; index < png.data.length; index += 4) {
    const [red, green, blue, alpha] = png.data.subarray(index, index + 4)
    if (alpha < 250) transparent += 1
    if (alpha > 0 && red < 15 && green < 15 && blue < 15) nearBlack += 1
    if (alpha > 0 && Math.max(red, green, blue) - Math.min(red, green, blue) > 12) colored += 1
  }

  expect(total).toBeGreaterThan(0)
  expect(transparent / total, 'canvas should be an opaque laboratory frame').toBeLessThan(0.01)
  expect(nearBlack / total, 'canvas should not be an all-black WebGL frame').toBeLessThan(0.9)
  expect(colored / total, 'canvas should contain meaningful non-background color').toBeGreaterThan(0.01)
}

export async function capturePng(page: Page, testInfo: TestInfo, stateName: string) {
  await assertNoHorizontalOverflow(page)
  if (await page.getByTestId('factory-canvas').count()) await assertCanvasIsRendered(page)
  await mkdir(screenshotDirectory, { recursive: true })
  const fileName = `v4-${testInfo.project.name}-${stateName}.png`
  const filePath = path.join(screenshotDirectory, fileName)
  await rasterizeFactoryCanvas(page)
  try {
    await page.screenshot({ fullPage: true, path: filePath })
  } finally {
    await restoreFactoryCanvas(page)
  }
  await assertFullPageCapture(filePath)
}

export async function captureViewportPng(page: Page, testInfo: TestInfo, stateName: string) {
  await assertNoHorizontalOverflow(page)
  if (await page.getByTestId('factory-canvas').count()) await assertCanvasIsRendered(page)
  await mkdir(screenshotDirectory, { recursive: true })
  const fileName = `v4-${testInfo.project.name}-${stateName}.png`
  const filePath = path.join(screenshotDirectory, fileName)
  await rasterizeFactoryCanvas(page)
  try {
    await page.screenshot({ fullPage: false, path: filePath })
  } finally {
    await restoreFactoryCanvas(page)
  }
  await assertFullPageCapture(filePath)
}

async function rasterizeFactoryCanvas(page: Page) {
  await page.evaluate(() => {
    document.querySelectorAll<HTMLElement>('[data-testid="factory-canvas"]').forEach((host) => {
      const canvas = host.querySelector('canvas')
      if (!canvas) return
      const image = document.createElement('img')
      image.alt = ''
      image.dataset.playwrightCanvasRaster = 'true'
      image.src = canvas.toDataURL('image/png')
      Object.assign(image.style, {
        height: '100%',
        inset: '0',
        objectFit: 'cover',
        pointerEvents: 'none',
        position: 'absolute',
        width: '100%',
        zIndex: '1',
      })
      canvas.dataset.playwrightCaptureHidden = 'true'
      canvas.style.visibility = 'hidden'
      host.appendChild(image)
    })
  })
  await page.waitForFunction(() => [...document.querySelectorAll<HTMLImageElement>('[data-playwright-canvas-raster="true"]')]
    .every((image) => image.complete && image.naturalWidth > 0))
}

async function restoreFactoryCanvas(page: Page) {
  await page.evaluate(() => {
    document.querySelectorAll('[data-playwright-canvas-raster="true"]').forEach((image) => image.remove())
    document.querySelectorAll<HTMLCanvasElement>('canvas[data-playwright-capture-hidden="true"]').forEach((canvas) => {
      canvas.style.visibility = ''
      delete canvas.dataset.playwrightCaptureHidden
    })
  })
}

async function assertFullPageCapture(filePath: string) {
  const png = PNG.sync.read(await readFile(filePath))
  const total = png.width * png.height
  let pureBlack = 0
  let transparent = 0
  for (let index = 0; index < png.data.length; index += 4) {
    const [red, green, blue, alpha] = png.data.subarray(index, index + 4)
    if (alpha === 0) transparent += 1
    if (alpha > 0 && red < 8 && green < 8 && blue < 8) pureBlack += 1
  }
  expect(pureBlack / total, 'full-page capture should not contain black compositor tiles').toBeLessThan(0.05)
  expect(transparent / total, 'full-page capture should not contain transparent compositor tiles').toBeLessThan(0.01)
}

export function countDifferences(left: string, right: string): number {
  return [...left].filter((value, index) => value !== right[index]).length
}

export function countArrayDifferences(left: string[], right: string[]): number {
  return left.filter((value, index) => value !== right[index]).length
}

export async function clickCorrectFunctionRow(page: Page): Promise<Locator> {
  const round = await currentRound(page)
  if (round.type !== 'protein') throw new Error('Expected the function-test action.')
  const expected = round.referenceRows.find((row) => row.id === round.correctRowId)
  if (!expected) throw new Error(`Missing function row ${round.correctRowId}.`)
  const row = page.getByTestId('task-dock').getByRole('radio').filter({
    hasText: expected.aminoAcidSequence.join(' - '),
  })
  await row.click()
  return row
}
