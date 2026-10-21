/**
 * Checks a production build (`dist/`) before it is deployed (034): the Cesium static files are
 * there, the page states the Cesium base URL that holds them, the Web Push service worker sits at
 * the root, and no text file carries something that looks like a secret.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

/** What must sit under the Cesium directory for the globe to load. */
export const CESIUM_PARTS = ['Cesium.js', 'Workers', 'Assets', 'ThirdParty', 'Widgets'];

/** Files whose text is scanned for secrets. */
const TEXT_FILE = /\.(?:html|js|mjs|css|json|map|txt|svg)$/i;

/**
 * Patterns that look like a secret in a built file: a ForeSignal token or stream ticket (`fsr_…`,
 * `fst_…` and the like, with a long body), a private key, or a bearer header with a literal value.
 */
export const SECRET_PATTERNS = [
  /\bfs[a-z]{0,2}_[A-Za-z0-9]{24,}\b/,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  /\bBearer [A-Za-z0-9._~+/-]{20,}=*/,
];

/** Every file under a directory, as paths relative to it. */
function filesUnder(dir) {
  const out = [];
  const walk = (current) => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const path = join(current, entry.name);
      if (entry.isDirectory()) walk(path);
      else out.push(relative(dir, path));
    }
  };
  walk(dir);
  return out;
}

/** Whether a path exists. */
function exists(path) {
  try {
    statSync(path);
    return true;
  } catch {
    return false;
  }
}

/**
 * The problems found in a build directory, as sentences; none means it is ready to deploy. The
 * Cesium base URL is read from `index.html` (`window.CESIUM_BASE_URL = "…"`) and must be the
 * directory the `Cesium.js` script tag loads from, which must hold {@link CESIUM_PARTS}.
 */
export function checkDist(dir) {
  const problems = [];
  const indexPath = join(dir, 'index.html');
  if (!exists(indexPath)) return [`${indexPath} is missing; run npm run build first.`];
  const html = readFileSync(indexPath, 'utf8');

  const declared = /window\.CESIUM_BASE_URL\s*=\s*"([^"]+)"/.exec(html)?.[1];
  const script = /<script[^>]+src="([^"]*?)Cesium\.js"/.exec(html)?.[1];
  if (!declared) problems.push('index.html does not set window.CESIUM_BASE_URL.');
  if (script === undefined) problems.push('index.html does not load Cesium.js.');
  if (declared && script !== undefined && declared !== script) {
    problems.push(`CESIUM_BASE_URL is ${declared}, but Cesium.js loads from ${script}.`);
  }
  if (declared) {
    const cesiumDir = join(dir, declared.replace(/^\.?\//, ''));
    for (const part of CESIUM_PARTS) {
      if (!exists(join(cesiumDir, part))) problems.push(`${join(declared, part)} is missing.`);
    }
  }

  if (!exists(join(dir, 'sw.js'))) problems.push('sw.js is missing from the root.');
  if (!/<script type="module"[^>]+src="[^"]*assets\/index-[\w-]+\.js"/.test(html)) {
    problems.push('index.html does not load a content-hashed assets/index-*.js.');
  }

  for (const file of filesUnder(dir)) {
    if (!TEXT_FILE.test(file)) continue;
    const text = readFileSync(join(dir, file), 'utf8');
    for (const pattern of SECRET_PATTERNS) {
      const found = pattern.exec(text);
      if (found)
        problems.push(`${file} contains what looks like a secret: ${found[0].slice(0, 12)}…`);
    }
  }
  return problems;
}
