import { expect, test } from '@playwright/test'
import { CODON_TABLE } from '../../src/game/content/codonTable'
import { beginRun, collectRuntimeIssues, completeRun } from './helpers'

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
        const dna = await dock.locator('.dna-row b').allTextContents()
        const slots = dock.locator('[aria-label^="mRNA slot"]')
        const pair: Record<string, string> = { A: 'U', T: 'A', C: 'G', G: 'C' }
        for (let index = 0; index < dna.length; index += 1) {
          const label = await slots.nth(index).getAttribute('aria-label')
          if (!label?.endsWith(', empty')) continue
          await dock.getByRole('button', { exact: true, name: pair[dna[index]] }).click()
        }
        await dock.getByRole('button', { name: 'Check mRNA' }).click()
      } else if (await page.getByRole('heading', { name: 'Build the amino acid chain' }).isVisible()) {
        for (let codonIndex = 0; codonIndex < 5; codonIndex += 1) {
          const signalGroup = dock.locator('[role="group"][aria-label^="Signals for"]:visible')
          const label = await signalGroup.getAttribute('aria-label')
          const codon = label?.replace('Signals for ', '')
          if (!codon || !(codon in CODON_TABLE)) throw new Error(`Missing active codon signal: ${label}`)
          const answer = CODON_TABLE[codon]
          await signalGroup.getByRole('button', { exact: true, name: answer }).click()
          await dock.getByRole('button', { name: 'Check codon' }).click()
          if (await page.getByTestId('shipment-overlay').isVisible()) break
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

  test('keeps an offline result recoverable and retries after the browser returns online', async ({ context, page }) => {
    let submissions = 0
    await page.route('**/api/attempt', async (route) => {
      submissions += 1
      await route.fulfill({ body: JSON.stringify({ ok: true }), contentType: 'application/json', status: 200 })
    })
    await page.goto('/')
    await beginRun(page, { name: 'Offline Recovery' })
    await context.setOffline(true)
    await completeRun(page)

    await expect(page.getByTestId('end-screen')).toBeVisible()
    await expect(page.getByTestId('submission-recovery-tools')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Retry submission' })).toBeVisible()
    expect(submissions).toBe(0)

    await context.setOffline(false)
    await page.evaluate(() => window.dispatchEvent(new Event('online')))
    await expect(page.getByText('Submitted', { exact: true })).toBeVisible()
    expect(submissions).toBe(1)
  })

  test('keeps controls usable when the WebGL context is lost', async ({ page }) => {
    const issues = collectRuntimeIssues(page)
    await page.goto('/')
    await beginRun(page, { name: 'WebGL Fallback' })
    const canvas = page.getByTestId('factory-canvas').locator('canvas')
    await expect(canvas).toBeVisible()

    await canvas.dispatchEvent('webglcontextlost')
    await expect(page.getByText('Cell lab view paused')).toBeVisible()
    await expect(page.getByText('Your work is safe. Continue with the lab controls.')).toBeVisible()

    const base = page.getByTestId('task-dock').getByRole('button', { exact: true, name: 'A' })
    await base.click()
    await expect(page.getByLabel('mRNA slot 1, A')).toBeVisible()
    issues.assertClean()
  })
})
