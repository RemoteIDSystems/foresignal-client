/// <reference types="vitest/config" />
import { defineConfig, loadEnv, type Plugin } from 'vite';
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

/** Where vite-plugin-cesium copies Cesium's static files, under the build's base. */
const CESIUM_DIR = 'cesium/';

/**
 * Sets `window.CESIUM_BASE_URL` in the page, before any script runs, to the directory
 * vite-plugin-cesium copies Cesium's `Workers`, `Assets`, `ThirdParty` and `Widgets` into (034).
 * Cesium would otherwise derive it from its own script tag; stating it makes the built output say
 * where the assets are, which `npm run verify:dist` checks.
 */
function cesiumBaseUrl(): Plugin {
  let base = '/';
  return {
    name: 'foresignal-cesium-base-url',
    configResolved(config) {
      base = config.base;
    },
    transformIndexHtml() {
      return [
        {
          tag: 'script',
          children: `window.CESIUM_BASE_URL = ${JSON.stringify(`${base}${CESIUM_DIR}`)};`,
          injectTo: 'head-prepend',
        },
      ];
    },
  };
}

/**
 * Vite configuration for the ForeSignal Client.
 *
 * Vite is build-time only: `vite build` emits static assets that the backend serves
 * same-origin. In development the dev server proxies the backend's paths (`/v1`, `/compat`, `/mcp`,
 * `/actuator`) so the app is same-origin in dev exactly as in production; the proxy is dev
 * tooling and never ships.
 */
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  const backend = env.VITE_FORESIGNAL_BACKEND || DEFAULT_BACKEND;
  const proxied = { target: backend, changeOrigin: true, ws: true };
  return {
    plugins: [react(), cesium({ cesiumBaseUrl: CESIUM_DIR }), cesiumBaseUrl()],
    define: {
      __APP_VERSION__: JSON.stringify(packageJson.version),
      __APP_DEPENDENCIES__: JSON.stringify(packageJson.dependencies),
    },
    server: {
      proxy: {
        '/v1': proxied,
        '/compat': proxied,
        '/mcp': proxied,
        '/actuator': proxied,
      },
    },
    preview: {
      proxy: {
        '/v1': proxied,
        '/compat': proxied,
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
