/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * Vite configuration for the ForeSignal Client.
 *
 * Vite is build-time only: `vite build` emits static assets that the backend serves
 * same-origin. Nothing here ships at runtime.
 */
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test-setup.ts'],
  },
});
