/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  // GitHub Pages serves the app from /<repo-name>/; local dev and preview use /.
  base: process.env.PAGES_BASE ?? '/',
  plugins: [react()],
  server: { port: 5173, open: false },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          react: ['react', 'react-dom', 'zustand'],
          flow: ['@xyflow/react'],
          charts: ['recharts'],
        },
      },
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
