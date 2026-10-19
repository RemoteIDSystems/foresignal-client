/// <reference types="vitest/config" />
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import cesium from 'vite-plugin-cesium';
import { readFileSync } from 'node:fs';

const packageJson = JSON.parse(
  readFileSync(new URL('./package.json', import.meta.url), 'utf8'),
) as {
  version: string;
  dependencies: Record<string, string>;
};

/**
 * Backend the dev server proxies to when `VITE_FORESIGNAL_BACKEND` is unset: the spec's
 * `servers[0].url`.
 */
const DEFAULT_BACKEND = 'http://localhost:8080';

/**
 * Vite configuration for the ForeSignal Client.
 *
 * Vite is build-time only: `vite build` emits static assets that the backend serves
 * same-origin. In development the dev server proxies the backend's paths (`/v1`, `/mcp`,
 * `/actuator`) so the app is same-origin in dev exactly as in production; the proxy is dev
 * tooling and never ships.
 */
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  const backend = env.VITE_FORESIGNAL_BACKEND || DEFAULT_BACKEND;
  const proxied = { target: backend, changeOrigin: true, ws: true };
  return {
    plugins: [react(), cesium()],
    define: {
      __APP_VERSION__: JSON.stringify(packageJson.version),
      __APP_DEPENDENCIES__: JSON.stringify(packageJson.dependencies),
    },
    server: {
      proxy: {
        '/v1': proxied,
        '/mcp': proxied,
        '/actuator': proxied,
      },
    },
    preview: {
      proxy: {
        '/v1': proxied,
        '/mcp': proxied,
        '/actuator': proxied,
      },
    },
    test: {
      environment: 'jsdom',
      globals: true,
      setupFiles: ['./src/test-setup.ts'],
      css: { modules: { classNameStrategy: 'non-scoped' } },
    },
  };
});
