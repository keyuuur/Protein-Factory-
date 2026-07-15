import { readFile } from 'node:fs/promises'
import { expect, test } from '@playwright/test'
import { CODON_TABLE } from '../../src/game/content/codonTable'

test.describe('result repository recovery', () => {
  test.beforeEach(({ page }, testInfo) => {
    void page
    test.skip(testInfo.project.name !== 'desktop-chromium', 'Desktop Chromium owns repository failure behavior.')
  })

  test('keeps a queued result in IndexedDB across reload when localStorage is unavailable', async ({ page }) => {
    await page.addInitScript(() => {
      Storage.prototype.setItem = () => { throw new DOMException('Storage denied', 'SecurityError') }
    })
    await page.route('**/api/attempt', (route) => route.fulfill({
      body: JSON.stringify({ error: 'Teacher storage unavailable.', ok: false, retryable: false }),
      contentType: 'application/json',
      status: 502,
    }))

    await page.goto('/')
    await completeStorageRun(page, 'IndexedDB Recovery')
    await expect(page.getByText('Not submitted; teacher action needed')).toBeVisible()

    const beforeReload = await readIndexedDbQueue(page)
    expect(beforeReload).toHaveLength(1)
    expect(beforeReload[0]).toMatchObject({ durability: 'indexeddb', status: 'failed-terminal' })

    await page.reload()
    const afterReload = await readIndexedDbQueue(page)
    expect(afterReload).toHaveLength(1)
    expect(afterReload[0].attemptId).toBe(beforeReload[0].attemptId)
    expect(afterReload[0].attempt).toEqual(beforeReload[0].attempt)
  })

  test('guards and exports a memory-only result when all durable storage is unavailable', async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(window, 'indexedDB', { configurable: true, value: undefined })
      Storage.prototype.setItem = () => { throw new DOMException('Storage denied', 'SecurityError') }
    })
    await page.route('**/api/attempt', (route) => route.abort('internetdisconnected'))

    await page.goto('/')
    await completeStorageRun(page, 'Memory Recovery')

    await expect(page.getByText(/This result only exists in this tab/)).toBeVisible()
    await expect(page.getByRole('button', { name: 'Replay' })).toBeDisabled()
    await expect(page.getByRole('button', { name: 'New student' })).toBeDisabled()

    const downloadPromise = page.waitForEvent('download')
    await page.getByRole('button', { name: 'Export recovery file' }).click()
    const download = await downloadPromise
    const path = await download.path()
    expect(path).not.toBeNull()
    const recovery = JSON.parse(await readFile(path as string, 'utf8')) as {
      queue: Array<{ attemptId: string; durability: string; status: string }>
      schemaVersion: string
    }
    expect(recovery.schemaVersion).toBe('protein-factory-recovery-v1')
    expect(recovery.queue).toContainEqual(expect.objectContaining({ durability: 'memory-only' }))
  })
})

async function completeStorageRun(page: import('@playwright/test').Page, name: string) {
  await page.getByLabel('First name').fill(name)
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
}

async function readIndexedDbQueue(page: import('@playwright/test').Page) {
  return page.evaluate(() => new Promise<Array<{ attempt: unknown; attemptId: string; durability: string; status: string }>>((resolve, reject) => {
    const request = indexedDB.open('pirate-protein-factory-results-v2', 1)
    request.onerror = () => reject(request.error)
    request.onsuccess = () => {
      const database = request.result
      const transaction = database.transaction('records', 'readonly')
      const getRequest = transaction.objectStore('records').get('submission-queue')
      getRequest.onerror = () => reject(getRequest.error)
      getRequest.onsuccess = () => {
        database.close()
        resolve(Array.isArray(getRequest.result) ? getRequest.result : [])
      }
    }
  }))
}
