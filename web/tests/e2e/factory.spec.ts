import { expect, type Page, type TestInfo, test } from '@playwright/test'
import type { FinalGamePayload } from '../../src/types'

test('factory flow supports classroom-safe setup, diagnostics, compact transitions, final details, and screenshots', async ({
  page,
}, testInfo) => {
  await page.goto('/')
  await expect(page.getByTestId('start-screen')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Start game' })).toBeDisabled()
  await expectNoHorizontalOverflow(page)
  await screenshot(page, testInfo, 'start')

  await page.getByText('Teacher demo / projector mode').click()
  await page.getByLabel('Enable demo mode').check()
  await page.getByLabel('Type DEMO to confirm').fill('DEMO')
  await expect(page.getByRole('button', { name: 'Start game' })).toBeDisabled()
  await page.getByLabel('Class period').selectOption('3')
  await expect(page.getByRole('button', { name: 'Start game' })).toBeEnabled()
  await page.getByLabel('Enable demo mode').uncheck()
  await expect(page.getByRole('button', { name: 'Start game' })).toBeDisabled()

  await page.getByLabel('First name').fill('Play Tester')
  await page.getByRole('button', { name: 'Start game' }).click()
  await expect(page.getByTestId('tutorial-screen')).toBeVisible()
  await screenshot(page, testInfo, 'tutorial')

  await page.getByRole('button', { name: 'Start Round 1' }).click()
  await page.getByRole('button', { name: 'Enter factory' }).click()
  await expect(page.getByTestId('factory-play')).toBeVisible()
  await screenshot(page, testInfo, 'closed-play')
  await page.getByRole('button', { name: /Start DNA/i }).click()
  await expect(page.getByTestId('task-dock')).toBeVisible()
  await screenshot(page, testInfo, 'dna-station')

  for (const base of ['A', 'A', 'A', 'A']) {
    await taskButton(page, base).click()
  }
  await taskButton(page, /Check answer/i).click()
  await expect(page.getByRole('status')).toContainText('Check DNA pairing.')
  await expect(page.getByRole('status')).toContainText('position 1')
  await screenshot(page, testInfo, 'wrong-dna-feedback')
  await taskButton(page, /Clear/i).click()
  await completeCurrentBaseRound(page, ['T', 'A', 'G', 'C'])

  await expect(page.getByTestId('feedback-screen')).toBeVisible()
  await screenshot(page, testInfo, 'shipment-success')
  await continueSuccess(page)

  await expect(page.getByTestId('task-dock')).toBeVisible()
  await taskButton(page, /Show hint/i).click()
  await completeCurrentBaseRound(page, ['G', 'C', 'A', 'T'])
  await continueSuccess(page)

  await completeCurrentBaseRound(page, ['A', 'U', 'G'])
  await continueSuccess(page)

  await completeCurrentBaseRound(page, ['G', 'C', 'U', 'A'])
  await continueSuccess(page)

  await taskButton(page, /Codon Key/i).click()
  await expect(page.getByTestId('codon-wheel-modal')).toBeVisible()
  await expect(page.getByText('Current codon')).toBeVisible()
  await screenshot(page, testInfo, 'codon-wheel')
  await page.getByLabel('Close codon wheel').click()
  await completePerCodonRound(page, ['Met', 'Val'])
  await continueSuccess(page)

  await expect(taskButton(page, /Check sequence/i)).toBeDisabled()
  for (const aminoAcid of ['Pro', 'Tyr', 'Lys']) {
    await taskButton(page, aminoAcid).click()
  }
  await screenshot(page, testInfo, 'full-translation')
  await expect(taskButton(page, /Check sequence/i)).toBeEnabled()
  await taskButton(page, /Check sequence/i).click()
  await continueSuccess(page)

  await completeProteinRound(page, 'Can digest lactose')
  await continueSuccess(page)
  await completeProteinRound(page, 'Helps produce melanin')
  await page.getByRole('button', { name: /See final score/i }).click()

  await expect(page.getByTestId('end-screen')).toBeVisible()
  await expect(page.getByText('8/8 stations completed')).toBeVisible()
  await expect(page.getByText(/Steady Run|Repair Run/)).toBeVisible()
  await expect(page.locator('.score-grid dd').filter({ hasText: 'Hidden' })).toHaveCount(2)
  await screenshot(page, testInfo, 'end')

  await page.getByRole('button', { name: 'Show details' }).click()
  await expect(page.getByText('Play Tester')).toBeVisible()
  await expect(page.locator('.score-grid div').filter({ hasText: /Period\s*3/ })).toBeVisible()
  await expect(page.getByText(/used a hint/i)).toBeVisible()
  await screenshot(page, testInfo, 'end-details')

  const payload = await readLocalPayload(page)
  expect(payload.studentName).toBe('Play Tester')
  expect(payload.isDemo).toBe(false)
  expect(payload.classPeriod).toBe('3')
  expect(payload.score).toBe(8)
  expect(payload.maxScore).toBe(8)
  expect(payload.schemaVersion).toBe('web-final-v2')
  expect(payload.attemptId).toMatch(/^ppf-/)
  expect(payload.roundsCompleted).toBe(8)
  expect(payload.totalRounds).toBe(8)
  expect(payload.submitType).toBe('Final Submit')
  expect(payload.percent).toBe(100)
  expect(payload.completionStatus).toBe('Completed')
  expect(payload.timeSpent).toBeGreaterThanOrEqual(1)
  expect(payload.roundResults).toHaveLength(8)
  expect(payload.missedSkills.some((skill) => skill.reason === 'hint')).toBe(true)
  expect(payload.cleanRounds).toBeGreaterThan(0)
  expect(payload.supportedRounds).toBeGreaterThan(0)
  expect(payload.factoryRating).toMatch(/Steady Run|Repair Run/)
  expect(payload.replayGoal).toContain('Replay')

  await page.getByRole('button', { name: 'Same student retry' }).click()
  await expect(page.getByTestId('round-intro')).toBeVisible()
  await screenshot(page, testInfo, 'replay-reset')
})

async function completeCurrentBaseRound(page: Page, bases: string[]) {
  await expect(page.getByTestId('task-dock')).toBeVisible()
  await expect(taskButton(page, /Check answer/i)).toBeDisabled()
  for (const base of bases) {
    await taskButton(page, base).click()
  }
  await expect(taskButton(page, /Check answer/i)).toBeEnabled()
  await taskButton(page, /Check answer/i).click()
}

async function completePerCodonRound(page: Page, aminoAcids: string[]) {
  for (const aminoAcid of aminoAcids) {
    await expect(taskButton(page, /Check codon/i)).toBeDisabled()
    await taskButton(page, aminoAcid).click()
    await expect(taskButton(page, /Check codon/i)).toBeEnabled()
    await taskButton(page, /Check codon/i).click()
  }
}

async function completeProteinRound(page: Page, trait: string) {
  await expect(taskButton(page, /Check trait/i)).toBeDisabled()
  await taskButton(page, new RegExp(trait, 'i')).click()
  await expect(taskButton(page, /Check trait/i)).toBeEnabled()
  await taskButton(page, /Check trait/i).click()
}

async function continueSuccess(page: Page) {
  await expect(page.getByTestId('feedback-screen')).toBeVisible()
  await page.getByRole('button', { name: /Next round/i }).click()
  await expect(page.getByTestId('task-dock')).toBeVisible()
}

function taskButton(page: Page, name: string | RegExp) {
  return page.getByTestId('task-dock').getByRole('button', { name, exact: typeof name === 'string' })
}

async function readLocalPayload(page: Page): Promise<FinalGamePayload> {
  return page.evaluate(() => {
    const raw = window.localStorage.getItem('pirate-protein-factory:last-payload')
    if (!raw) {
      throw new Error('Missing local payload')
    }
    return JSON.parse(raw) as FinalGamePayload
  })
}

async function expectNoHorizontalOverflow(page: Page) {
  const hasOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)
  expect(hasOverflow).toBe(false)
}

async function screenshot(page: Page, testInfo: TestInfo, name: string) {
  await expectNoHorizontalOverflow(page)
  await page.screenshot({
    path: `../output/playwright/${testInfo.project.name}-level2-${name}.png`,
    fullPage: false,
  })
}
