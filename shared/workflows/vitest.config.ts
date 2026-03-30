import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: '@hq/workflows',
    environment: 'node',
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/workflows/**', 'src/index.ts', 'src/types.ts'],
      thresholds: {
        statements: 85,
        branches: 75,
        functions: 90,
        lines: 85,
      },
    },
  },
});
