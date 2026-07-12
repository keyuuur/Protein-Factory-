import { expect, type Page, type TestInfo, test } from '@playwright/test'
import { PNG } from 'pngjs'
import { beginRun, completeStage, currentRound } from './helpers'

test('completes both linked protein orders with visible factory cargo', async ({ page }, testInfo) => {
  const errors: string[] = []
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()) })
  await page.route('**/api/attempt', (route) => route.fulfill({ body: JSON.stringify({ ok: true }), contentType: 'application/json', status: 200 }))
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Protein Factory' })).toBeVisible()
  await noOverflow(page)
  await shot(page, testInfo, 'start')

  await beginRun(page)
  await expect(page.getByTestId('factory-play')).toBeVisible()
  await page.getByRole('button', { name: /Start DNA/i }).click()
  await expect(page.getByTestId('task-dock')).toBeVisible()
  await assertCanvasHasColor(page)
  await shot(page, testInfo, 'dna-assembly')

  for (let index = 0; index < 8; index += 1) {
    const round = await currentRound(page)
    if (index === 2) await shot(page, testInfo, 'translation')
    if (index === 7) await shot(page, testInfo, 'function-test')
    await completeStage(page, round)
    await expect(page.getByTestId('shipment-overlay')).toBeVisible()
    if (index === 0 || index === 7) await shot(page, testInfo, `shipment-${index + 1}`)
    await page.getByRole('button', { name: index === 7 ? 'Finish order' : 'Continue production' }).dispatchEvent('click')
  }

  await expect(page.getByTestId('end-screen')).toBeVisible()
  await expect(page.getByText('8/8 stages independent')).toBeVisible()
  await expect(page.getByText('Precision Production')).toBeVisible()
  await expect(page.getByText('Submitted to your teacher.')).toBeVisible()
  await shot(page, testInfo, 'end')
  expect(errors).toEqual([])
})

async function assertCanvasHasColor(page: Page) {
  const buffer = await page.locator('canvas.factory-canvas').screenshot()
  const png = PNG.sync.read(buffer)
  let nearBlack = 0
  const total = png.width * png.height
  for (let index = 0; index < png.data.length; index += 4) {
    if (png.data[index] < 20 && png.data[index + 1] < 20 && png.data[index + 2] < 20) nearBlack += 1
  }
  expect(total).toBeGreaterThan(0)
  expect(nearBlack / total).toBeLessThan(0.05)
}

async function noOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
}

async function shot(page: Page, testInfo: TestInfo, name: string) {
  if (testInfo.project.name !== 'desktop-chromium' && !['start', 'dna-assembly', 'end'].includes(name)) return
  await noOverflow(page)
  await page.screenshot({ path: `../output/playwright/${testInfo.project.name}-v3-${name}.png` })
}
