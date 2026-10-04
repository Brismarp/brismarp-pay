import path from 'node:path';
import { defineConfig, devices } from '@playwright/test';

const apiDir = path.join(__dirname, '..', 'api');
const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/v1';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  timeout: 90_000,
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: process.env.CI ? 'npm run start:prod' : 'npm run start',
      cwd: apiDir,
      url: 'http://localhost:3001/v1/health',
      reuseExistingServer: !process.env.CI || process.env.PLAYWRIGHT_REUSE_SERVER === '1',
      timeout: 120_000,
      env: {
        ...process.env,
        PORT: '3001',
        PAYMENT_PROVIDER: 'mock',
        CORS_ALLOWED_ORIGINS: process.env.CORS_ALLOWED_ORIGINS ?? 'http://localhost:3000',
      },
    },
    {
      command: process.env.CI ? 'npm run start' : 'npm run dev',
      url: 'http://localhost:3000',
      reuseExistingServer: !process.env.CI || process.env.PLAYWRIGHT_REUSE_SERVER === '1',
      timeout: 120_000,
      env: {
        ...process.env,
        PORT: '3000',
        NEXT_PUBLIC_API_URL: apiUrl,
      },
    },
  ],
});
