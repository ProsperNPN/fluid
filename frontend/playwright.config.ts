import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './e2e', timeout: 180000, workers: 1, reporter: 'list',
  use: { baseURL: process.env.FLUID_QA_FRONTEND || 'http://127.0.0.1:13000',
    launchOptions: { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH },
    trace: 'retain-on-failure' },
});
