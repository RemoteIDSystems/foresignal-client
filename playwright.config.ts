import { defineConfig } from '@playwright/test';

/** WebGL in software (SwiftShader): the same on every machine, and the default. */
const SOFTWARE_WEBGL = ['--enable-unsafe-swiftshader', '--use-angle=swiftshader'];
/** WebGL on the machine's GPU through ANGLE's OpenGL backend, for `E2E_GPU=1` (frame timing). */
const HARDWARE_WEBGL = ['--use-angle=gl', '--ignore-gpu-blocklist', '--enable-gpu'];
/** True when the run should use the GPU. */
const GPU = process.env.E2E_GPU === '1';

/** Port the end-to-end run serves the client on; the dev server's default, 5173, may be taken. */
const PORT = Number(process.env.E2E_PORT ?? 5179);

/**
 * Playwright end-to-end checks: a real Chromium (WebGL through SwiftShader) against the dev
 * server, which proxies `/v1` to the backend at `http://localhost:8080`. The backend must be
 * running; these checks read its live data. Specs are `e2e/*.e2e.ts`, apart from Vitest's
 * `*.test.ts`. `E2E_GPU=1` runs Chromium on the machine's GPU instead, for frame timing.
 */
export default defineConfig({
  testDir: 'e2e',
  testMatch: '**/*.e2e.ts',
  timeout: 120_000,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    viewport: { width: 1672, height: 941 },
    launchOptions: { args: GPU ? HARDWARE_WEBGL : SOFTWARE_WEBGL },
  },
  webServer: {
    command: `npx vite --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
