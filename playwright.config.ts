
import { defineConfig } from '@playwright/test';
import * as dotenv from 'dotenv';

dotenv.config();

export default defineConfig({
  testDir: './tests',
    
  workers: 1,
  fullyParallel: false,
  retries: 0,

  timeout: 600_000,

  reporter: [
    ['list'],
    ['html', {
      outputFolder: 'playwright-report',
      open: 'never',
      title: 'QA Automation Report',
    }],
    ['json', {
      outputFile: 'test-results/results.json',
    }],
  ],

  use: {
    baseURL: process.env.BASE_URL,
    extraHTTPHeaders: {
      Accept: 'application/json',
    },

    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
});
