import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: '.',
  testMatch: '*.spec.ts',
  workers: 1,
  fullyParallel: false,
  timeout: 60000,
  expect: { timeout: 10000 },
  outputDir: '../../.test-build/playwright-results',
  reporter: [['list']],
  snapshotPathTemplate: '{testDir}/__screenshots__/{platform}/{testFilePath}/{arg}{ext}',
  use: { actionTimeout: 10000, trace: 'retain-on-failure', screenshot: 'only-on-failure' },
});
