import { mkdir } from 'node:fs/promises'
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
      const button = dock.getByRole('button', { exact: true, name: base })
      const slot = dock.locator('[aria-label^="mRNA slot"]').nth(index)
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
    for (let index = 0; index < round.answers.length; index += 1) {
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
  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    innerWidth: window.innerWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }))
  expect(dimensions.scrollWidth, JSON.stringify(dimensions)).toBeLessThanOrEqual(dimensions.innerWidth + 1)
}

export async function assertCanvasIsRendered(page: Page) {
  const canvas = page.getByTestId('factory-canvas').locator('canvas')
  await expect(canvas).toBeVisible()
  const buffer = await canvas.screenshot()
  const png = PNG.sync.read(buffer)
  const total = png.width * png.height
  let nearBlack = 0
  let colored = 0

  for (let index = 0; index < png.data.length; index += 4) {
    const [red, green, blue, alpha] = png.data.subarray(index, index + 4)
    if (alpha > 0 && red < 15 && green < 15 && blue < 15) nearBlack += 1
    if (alpha > 0 && Math.max(red, green, blue) - Math.min(red, green, blue) > 12) colored += 1
  }

  expect(total).toBeGreaterThan(0)
  expect(nearBlack / total, 'canvas should not be an all-black WebGL frame').toBeLessThan(0.9)
  expect(colored / total, 'canvas should contain rendered color').toBeGreaterThan(0.005)
}

export async function capturePng(page: Page, testInfo: TestInfo, stateName: string) {
  await assertNoHorizontalOverflow(page)
  await mkdir(screenshotDirectory, { recursive: true })
  const fileName = `v4-${testInfo.project.name}-${stateName}.png`
  await page.screenshot({ fullPage: true, path: path.join(screenshotDirectory, fileName) })
}

export async function captureViewportPng(page: Page, testInfo: TestInfo, stateName: string) {
  await assertNoHorizontalOverflow(page)
  await mkdir(screenshotDirectory, { recursive: true })
  const fileName = `v4-${testInfo.project.name}-${stateName}.png`
  await page.screenshot({ fullPage: false, path: path.join(screenshotDirectory, fileName) })
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
