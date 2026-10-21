/**
 * Copies the checked production build into the backend's web root (034). See
 * `scripts/release/deploy.mjs` and `docs/Deploy.md`.
 *
 * Usage: node scripts/deploy-web.mjs WEB_ROOT [--clean]
 *   WEB_ROOT  the backend's web root, for example ../foresignal/deploy/web
 *   --clean   remove what is there first (keeping .gitkeep)
 */
import { deployDist } from './release/deploy.mjs';
import { checkDist } from './release/verify.mjs';

const args = process.argv.slice(2);
const target = args.find((arg) => !arg.startsWith('--'));
if (!target) {
  console.error('Usage: node scripts/deploy-web.mjs WEB_ROOT [--clean]');
  process.exit(2);
}
const problems = checkDist('dist');
if (problems.length > 0) {
  for (const problem of problems) console.error(`✗ ${problem}`);
  process.exit(1);
}
const copied = deployDist('dist', target, { clean: args.includes('--clean') });
console.log(`✓ Copied ${copied} entries of dist into ${target}.`);
