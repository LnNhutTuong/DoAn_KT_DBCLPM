import { defineConfig } from '@playwright/test';
import * as dotenv from 'dotenv';

dotenv.config();

export default defineConfig({
  testDir: './tests',
  // Gateway có rate-limit và nhiều test dùng chung tài khoản: chạy tuần tự, không retry
  workers: 1,
  fullyParallel: false,
  retries: 0,
  timeout: 30_000,
  reporter: [
    ['list'],
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
    ['json', { outputFile: 'test-results/results.json' }],
  ],
  use: {
    baseURL: process.env.BASE_URL,
    extraHTTPHeaders: { Accept: 'application/json' },
  },
});
