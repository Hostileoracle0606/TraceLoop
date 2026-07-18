import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  resolve: {
    alias: {
      '@engine': path.resolve(__dirname, 'src/engine'),
      '@backend': path.resolve(__dirname, 'backend'),
      '@fixtures': path.resolve(__dirname, 'src/fixtures'),
    },
  },
  test: {
    setupFiles: ['./backend/trpc/__tests__/contracts/setup.ts'],
    exclude: [
      'node_modules/**',
      'frontend/e2e/**',
      'frontend/node_modules/**',
      '.claude/**',
    ],
  },
});
