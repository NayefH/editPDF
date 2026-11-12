import { defineConfig } from '@playwright/test'
export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  workers: 1,
  timeout: 45000,
  webServer: process.env.CI ? {
    command: 'node node_modules/vite/bin/vite.js preview --host 127.0.0.1 --port 5175 --strictPort',
    url: process.env.TEST_URL || 'http://127.0.0.1:5175',
    reuseExistingServer: false,
  } : undefined,
  use: {
    baseURL: process.env.TEST_URL || 'http://127.0.0.1:5175',
    viewport: { width: 1440, height: 1100 },
    launchOptions: process.platform === 'win32' ? { executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' } : {},
  },
})
