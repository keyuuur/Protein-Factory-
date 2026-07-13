import { readFile } from 'node:fs/promises'
import { expect, test } from '@playwright/test'
import { beginRun, completeRun } from './helpers'

test.describe('submission recovery', () => {
  test.beforeEach(({ page }, testInfo) => {
    void page
    test.skip(testInfo.project.name !== 'desktop-chromium', 'Desktop Chromium owns submission recovery behavior.')
  })

  test('manually retries a durable queued result and exports its recovery file', async ({ page }) => {
    const pageErrors: string[] = []
    page.on('pageerror', (error) => pageErrors.push(error.message))
    let acceptSubmission = false
    let requestCount = 0
    await page.route('**/api/attempt', async (route) => {
      requestCount += 1
      await route.fulfill({
        body: JSON.stringify(acceptSubmission ? { ok: true } : { error: 'Classroom endpoint unavailable.', ok: false }),
        contentType: 'application/json',
        status: acceptSubmission ? 200 : 503,
      })
    })

    await page.goto('/')
    await beginRun(page, { name: 'Recovery Test' })
    await completeRun(page)

    await expect(page.getByTestId('submission-recovery-tools')).toBeVisible()
    await expect.poll(() => requestCount).toBeGreaterThan(0)
    await expect(page.getByText('Classroom endpoint unavailable.')).toBeVisible()

    acceptSubmission = true
    await page.getByRole('button', { name: 'Retry submission' }).click()
    await expect(page.getByText('Submitted', { exact: true })).toBeVisible()

    const downloadPromise = page.waitForEvent('download')
    await page.getByRole('button', { name: 'Export recovery file' }).click()
    const download = await downloadPromise
    const path = await download.path()
    expect(path).not.toBeNull()
    const recovery = JSON.parse(await readFile(path as string, 'utf8')) as {
      queue: Array<{ attemptId: string; status: string }>
      schemaVersion: string
    }
    expect(recovery.schemaVersion).toBe('protein-factory-recovery-v1')
    expect(recovery.queue).toContainEqual(expect.objectContaining({ status: 'submitted' }))
    expect(pageErrors).toEqual([])
  })
})
