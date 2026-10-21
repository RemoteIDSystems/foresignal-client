/**
 * Copies a production build into the backend's web root (034), which its reverse proxy serves
 * same-origin with a single-page-app fallback (the backend's `deploy/caddy/Caddyfile` serves
 * `./deploy/web` at `/srv/web`).
 */
import { cpSync, existsSync, readdirSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';

/** Files in the web root that a deploy keeps: the backend repository's placeholder. */
export const KEPT = new Set(['.gitkeep']);

/**
 * Copies `dist` into `target`. Files the build no longer has are left in place unless `clean` is
 * set, so a browser still holding the last `index.html` can fetch its hashed assets; with `clean`
 * every entry of `target` except {@link KEPT} is removed first. `index.html` is copied last, so
 * the page never names assets that are not there yet. Returns how many top-level entries were
 * copied.
 */
export function deployDist(dist, target, { clean = false } = {}) {
  if (!existsSync(join(dist, 'index.html'))) {
    throw new Error(`${dist} has no index.html; run npm run build first.`);
  }
  if (!existsSync(target) || !statSync(target).isDirectory()) {
    throw new Error(`${target} is not a directory.`);
  }
  if (clean) {
    for (const entry of readdirSync(target)) {
      if (!KEPT.has(entry)) rmSync(join(target, entry), { recursive: true, force: true });
    }
  }
  const entries = readdirSync(dist).filter((entry) => entry !== 'index.html');
  for (const entry of entries) {
    cpSync(join(dist, entry), join(target, entry), { recursive: true, force: true });
  }
  cpSync(join(dist, 'index.html'), join(target, 'index.html'), { force: true });
  return entries.length + 1;
}
