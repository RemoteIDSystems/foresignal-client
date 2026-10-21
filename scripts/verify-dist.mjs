/**
 * Checks the production build before it is deployed (034). See `scripts/release/verify.mjs`.
 *
 * Usage: node scripts/verify-dist.mjs [DIST_DIR]   (default: dist)
 */
import { checkDist } from './release/verify.mjs';

const dir = process.argv[2] ?? 'dist';
const problems = checkDist(dir);
for (const problem of problems) console.error(`✗ ${problem}`);
if (problems.length > 0) process.exit(1);
console.log(`✓ ${dir} is ready to deploy.`);
