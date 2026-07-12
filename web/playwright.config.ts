import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 300_000,
  workers: 1,
  expect: {
    timeout: 10_000,
  },
  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'npm run build && npm run preview -- --host 127.0.0.1 --port 4173',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  projects: [
    {
      name: 'desktop-chromium',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1180, height: 820 },
      },
    },
    {
      name: 'ipad-portrait',
      use: {
        browserName: 'chromium',
        viewport: { width: 768, height: 1024 },
        deviceScaleFactor: 2,
        hasTouch: true,
        isMobile: true,
        userAgent: devices['iPad (gen 7)'].userAgent,
      },
    },
    {
      name: 'ipad-webkit',
      use: {
        ...devices['iPad (gen 7)'],
        browserName: 'webkit',
        viewport: { width: 768, height: 1024 },
      },
    },
    {
      name: 'phone-portrait',
      use: {
        browserName: 'chromium',
        viewport: { width: 390, height: 844 },
        deviceScaleFactor: 3,
        hasTouch: true,
        isMobile: true,
        userAgent: devices['Pixel 7'].userAgent,
      },
    },
  ],
})
