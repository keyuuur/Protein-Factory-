import { expect, test } from '@playwright/test'
import { beginRun, collectRuntimeIssues, currentRound, currentState } from './helpers'

test.describe('V4 checkpoint recovery', () => {
  test.beforeEach(({ page }, testInfo) => {
    void page
    test.skip(testInfo.project.name !== 'desktop-chromium', 'Desktop Chromium owns persistence behavior.')
  })

  test('resumes the exact partial transcription and can discard the checkpoint', async ({ page }) => {
    const issues = collectRuntimeIssues(page)
    await page.goto('/')
    await beginRun(page)
    const round = await currentRound(page)
    expect(round.type).toBe('transcription')
    if (round.type !== 'transcription') return
    const partial = round.answer.slice(0, 5)

    for (const base of partial) {
      await page.getByTestId('task-dock').getByRole('button', { exact: true, name: base }).click()
    }
    await expect.poll(async () => (await currentState(page)).roundState.input).toBe(partial)

    await page.reload()
    await expect(page.getByTestId('recovery-screen')).toBeVisible()
    await page.getByRole('button', { name: 'Resume' }).click()
    await expect(page.getByTestId('task-dock')).toBeVisible()
    expect((await currentState(page)).roundState.input).toBe(partial)
    for (let index = 0; index < partial.length; index += 1) {
      await expect(page.getByLabel(`mRNA slot ${index + 1}, ${partial[index]}`)).toBeVisible()
    }

    await page.reload()
    await page.getByRole('button', { name: 'Start Over' }).click()
    await expect(page.getByRole('button', { name: 'Delete saved run' })).toBeFocused()
    await page.getByRole('button', { name: 'Cancel' }).click()
    await expect(page.getByRole('button', { name: 'Start Over' })).toBeFocused()
    await page.getByRole('button', { name: 'Start Over' }).click()
    await page.getByRole('button', { name: 'Delete saved run' }).click()
    await expect(page.getByTestId('start-screen')).toBeVisible()
    expect(await page.evaluate(() => localStorage.getItem('pirate-protein-factory:last-checkpoint'))).toBeNull()
    issues.assertClean()
  })
})
