import { defineConfig } from '@playwright/test';
export default defineConfig({ testDir: './tests', outputDir: './dist/test-results', workers: 1, timeout: 30_000 });
