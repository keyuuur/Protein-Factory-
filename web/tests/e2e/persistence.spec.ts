import { expect, test } from '@playwright/test'
import { beginRun, currentRound } from './helpers'

test('restores exact cargo after refresh and supports Start Over', async ({ page }) => {
  await page.goto('/')
  await beginRun(page)
  await page.getByRole('button', { name: /Start DNA/i }).click()
  const round = await currentRound(page)
  const partial = round.answer.slice(0, 4) as string
  for (const base of partial) await page.getByTestId('task-dock').getByRole('button', { exact: true, name: base }).click()
  await expect.poll(() => page.evaluate(() => {
    const envelope = JSON.parse(localStorage.getItem('pirate-protein-factory:last-checkpoint') || '{}')
    return envelope.state?.roundState?.input
  })).toBe(partial)

  await page.reload()
  await expect(page.getByTestId('recovery-screen')).toBeVisible()
  await page.getByRole('button', { name: 'Resume' }).click()
  await expect(page.getByTestId('task-dock')).toBeVisible()
  await expect(page.locator('.sequence-board').filter({ hasText: partial })).toBeVisible()

  await page.reload()
  await page.getByRole('button', { name: 'Start Over' }).click()
  await expect(page.getByTestId('start-screen')).toBeVisible()
  expect(await page.evaluate(() => localStorage.getItem('pirate-protein-factory:last-checkpoint'))).toBeNull()
})
