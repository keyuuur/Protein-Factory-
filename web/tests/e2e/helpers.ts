import { expect, type Page } from '@playwright/test'

export async function beginRun(page: Page) {
  await page.getByLabel('First name').fill('Test Student')
  await page.getByLabel('Class period').selectOption('3')
  await page.getByRole('button', { name: 'Start game' }).click()
  await page.getByRole('button', { name: 'Start Round 1' }).click()
  await page.getByRole('button', { name: 'Enter cell lab' }).click()
}

export async function currentRound(page: Page): Promise<any> {
  await expect.poll(() => page.evaluate(() => Boolean(localStorage.getItem('pirate-protein-factory:last-checkpoint')))).toBe(true)
  return page.evaluate(() => {
    const envelope = JSON.parse(localStorage.getItem('pirate-protein-factory:last-checkpoint') || '{}')
    return envelope.state.runManifest.rounds[envelope.state.currentRoundIndex]
  })
}

export async function completeStage(page: Page, round: any) {
  const dock = page.getByTestId('task-dock')
  if (round.type === 'dna' || round.type === 'transcription') {
    for (const base of round.answer as string) await dock.getByRole('button', { exact: true, name: base }).dispatchEvent('click')
    await dock.getByRole('button', { name: 'Check answer' }).dispatchEvent('click')
    return
  }
  if (round.type === 'translation') {
    for (const answer of round.answers as string[]) await dock.getByRole('button', { exact: true, name: answer }).dispatchEvent('click')
    await dock.getByRole('button', { name: 'Check sequence' }).dispatchEvent('click')
    return
  }
  await dock.locator('.trait-card').filter({ hasText: round.correctTrait }).dispatchEvent('click')
  await dock.getByRole('button', { name: 'Check trait' }).dispatchEvent('click')
}
