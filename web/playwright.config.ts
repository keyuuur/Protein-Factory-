import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 180_000,
  fullyParallel: true,
  workers: process.env.CI ? 1 : 2,
  expect: {
    timeout: 10_000,
  },
  use: {
    baseURL: 'http://127.0.0.1:4173',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    video: 'retain-on-failure',
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
      name: 'ipad-landscape',
      use: {
        ...devices['iPad (gen 7) landscape'],
        browserName: 'webkit',
        viewport: { width: 1024, height: 768 },
      },
    },
    {
      name: 'phone-portrait',
      use: {
        ...devices['Pixel 7'],
        browserName: 'chromium',
        viewport: { width: 390, height: 844 },
      },
    },
    {
      name: 'iphone-webkit',
      use: {
        ...devices['iPhone 13'],
        browserName: 'webkit',
      },
    },
  ],
})
