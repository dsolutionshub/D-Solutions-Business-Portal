import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // API tests start a local D1/R2 (workerd) per file.
    testTimeout: 30_000,
    hookTimeout: 60_000,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/test/**', 'src/db/schema.ts'],
      reporter: ['text-summary', 'text', 'html', 'json-summary'],
      reportsDirectory: 'coverage',
      // the business rules live in services/: keep them well covered
      thresholds: {
        'src/services/**': { statements: 80, branches: 75, functions: 80, lines: 80 }
      }
    }
  }
});
