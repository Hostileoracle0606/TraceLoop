import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@engine': fileURLToPath(new URL('../src/engine', import.meta.url)),
      '@fixtures': fileURLToPath(new URL('../src/fixtures', import.meta.url)),
      '@backend': fileURLToPath(new URL('../backend', import.meta.url)),
    },
  },
  server: {
    port: 5173,
    strictPort: true,
    // allow importing the engine from the repo root (one level above the Vite root)
    fs: { allow: ['..'] },
  },
});
