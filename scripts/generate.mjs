/**
 * Generates the typed API surface from the vendored backend contract.
 *
 * Reads `openapi/OpenAPI.json` and writes `src/api/generated/schema.ts` with openapi-typescript.
 * The output is never hand-edited; rerun this after the vendored spec is refreshed.
 */
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
execFileSync(
  resolve(root, 'node_modules/.bin/openapi-typescript'),
  ['openapi/OpenAPI.json', '-o', 'src/api/generated/schema.ts'],
  { cwd: root, stdio: 'inherit' },
);
