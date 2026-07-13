import { expect, test } from '@playwright/test'
import { CODON_TABLE } from '../../src/game/content/codonTable'
import { collectRuntimeIssues } from './helpers'

test.describe('V4 classroom failure handling', () => {
  test.beforeEach(({ page }, testInfo) => {
    void page
    test.skip(testInfo.project.name !== 'desktop-chromium', 'Desktop Chromium owns failure-path behavior.')
  })

  test('uses IndexedDB without warning when localStorage is unavailable', async ({ page }) => {
    const issues = collectRuntimeIssues(page)
    await page.addInitScript(() => {
      Storage.prototype.setItem = () => { throw new DOMException('Storage denied', 'SecurityError') }
    })
    await page.goto('/')
    await page.getByLabel('First name').fill('Storage Test')
    await page.getByLabel('Class period').selectOption('3')
    await page.getByRole('button', { name: 'Begin' }).click()
    await expect(page.getByText('Device storage unavailable')).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Start Protein 1' })).toBeVisible()
    expect(issues.pageErrors).toEqual([])
  })

  test('shows an honest warning when all durable device storage is unavailable', async ({ page }) => {
    const issues = collectRuntimeIssues(page)
    await page.addInitScript(() => {
      Object.defineProperty(window, 'indexedDB', { configurable: true, value: undefined })
      Storage.prototype.setItem = () => { throw new DOMException('Storage denied', 'SecurityError') }
    })
    await page.goto('/')
    await page.getByLabel('First name').fill('Memory Test')
    await page.getByLabel('Class period').selectOption('3')
    await page.getByRole('button', { name: 'Begin' }).click()
    await expect(page.getByText('Device storage unavailable')).toBeVisible()
    expect(issues.pageErrors).toEqual([])
  })

  test('submits a completed online run even when device storage is denied', async ({ page }) => {
    let submissions = 0
    await page.route('**/api/attempt', async (route) => {
      submissions += 1
      await route.fulfill({ body: JSON.stringify({ ok: true }), contentType: 'application/json', status: 200 })
    })
    await page.addInitScript(() => {
      Storage.prototype.setItem = () => { throw new DOMException('Storage denied', 'SecurityError') }
    })
    await page.goto('/')
    await page.getByLabel('First name').fill('Storage Completion')
    await page.getByLabel('Class period').selectOption('3')
    await page.getByRole('button', { name: 'Begin' }).click()
    await page.getByRole('button', { name: 'Start Protein 1' }).click()

    for (let action = 0; action < 9; action += 1) {
      const dock = page.getByTestId('task-dock')
      if (await page.getByRole('heading', { name: 'Build the mRNA' }).isVisible()) {
        const dna = (await dock.locator('.dna-row b').allTextContents()).join('')
        const pair: Record<string, string> = { A: 'U', T: 'A', C: 'G', G: 'C' }
        for (const base of dna) await dock.getByRole('button', { exact: true, name: pair[base] }).click()
        await dock.getByRole('button', { name: 'Check mRNA' }).click()
      } else if (await page.getByRole('heading', { name: 'Build the amino acid chain' }).isVisible()) {
        for (let codonIndex = 0; codonIndex < 5; codonIndex += 1) {
          const codon = await dock.locator('.codon-selector button strong').nth(codonIndex).innerText()
          const answer = CODON_TABLE[codon]
          await dock.getByRole('group', { name: `Signals for ${codon}` }).getByRole('button', { exact: true, name: answer }).click()
          await dock.getByRole('button', { name: 'Check codon' }).click()
        }
      } else {
        const chain = await dock.locator('.chain-under-test strong').innerText()
        await dock.getByRole('radio').filter({ hasText: chain.split('-').join(' - ') }).click()
        await dock.getByRole('button', { name: 'Check Match' }).click()
      }
      await page.getByTestId('shipment-overlay').getByRole('button').click()
    }

    await expect(page.getByTestId('end-screen')).toBeVisible()
    await expect(page.getByText('Submitted', { exact: true })).toBeVisible()
    expect(submissions).toBe(1)
  })
})
