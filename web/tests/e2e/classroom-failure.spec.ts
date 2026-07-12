import { expect, test } from '@playwright/test'
import { beginRun } from './helpers'

test('shows an honest warning when device storage is unavailable', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'One browser is sufficient for the storage-denial contract.')
  await page.addInitScript(() => {
    Storage.prototype.setItem = () => { throw new DOMException('Storage denied', 'SecurityError') }
  })
  await page.goto('/')
  await beginRun(page)
  await expect(page.getByText('Device storage unavailable')).toBeVisible()
})
