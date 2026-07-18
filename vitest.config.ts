import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    setupFiles: ['./backend/trpc/__tests__/contracts/setup.ts'],
    exclude: [
      'node_modules/**',
      'frontend/e2e/**',
      'frontend/node_modules/**',
    ],
  },
});
