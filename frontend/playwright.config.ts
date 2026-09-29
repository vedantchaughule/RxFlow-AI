import { defineConfig, devices } from '@playwright/test';

const frontendPort = Number(process.env.RXFLOW_E2E_FRONTEND_PORT ?? 5190);
const backendPort = Number(process.env.RXFLOW_E2E_BACKEND_PORT ?? 5050);
const frontendOrigin = `http://127.0.0.1:${frontendPort}`;
const backendOrigin = `http://127.0.0.1:${backendPort}`;

export default defineConfig({
  testDir: './e2e',
  outputDir: './test-results',
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: [['list'], ['html', { outputFolder: 'playwright-report', open: 'never' }]],
  expect: {
    toHaveScreenshot: {
      animations: 'disabled',
      caret: 'hide',
      maxDiffPixelRatio: 0.01,
    },
  },
  use: {
    baseURL: frontendOrigin,
    locale: 'en-IN',
    timezoneId: 'Asia/Kolkata',
    reducedMotion: 'reduce',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'desktop',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1440, height: 900 },
      },
    },
    {
      name: 'tablet',
      grep: /dashboard|@a11y/,
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 820, height: 1180 },
        hasTouch: true,
      },
    },
    {
      name: 'mobile',
      use: {
        ...devices['iPhone 13'],
        browserName: 'chromium',
        viewport: { width: 390, height: 844 },
      },
    },
  ],
  webServer: [
    {
      command: `npm run dev -- --mode e2e --host 127.0.0.1 --port ${frontendPort} --strictPort`,
      url: frontendOrigin,
      env: { ...process.env, VITE_API_BASE_URL: backendOrigin },
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
    {
      command: 'npm --prefix ../backend run test:e2e-server',
      url: `${backendOrigin}/ready`,
      env: { ...process.env, RXFLOW_E2E_BACKEND_PORT: String(backendPort), RXFLOW_E2E_FRONTEND_ORIGIN: frontendOrigin },
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
  ],
});
