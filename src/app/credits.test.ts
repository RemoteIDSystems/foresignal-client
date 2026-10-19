// @vitest-environment node
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { PACKAGE_CREDITS } from './credits';

const root = fileURLToPath(new URL('../../', import.meta.url));
const readJson = (path: string) =>
  JSON.parse(readFileSync(`${root}${path}`, 'utf8')) as Record<string, unknown>;

describe('credits', () => {
  it('credits every runtime dependency, and nothing else', () => {
    const dependencies = Object.keys(readJson('package.json').dependencies as object);
    expect(PACKAGE_CREDITS.map((pkg) => pkg.name).sort()).toEqual(dependencies.sort());
  });

  it.each(PACKAGE_CREDITS)('states $name’s own license', ({ name, license }) => {
    expect(readJson(`node_modules/${name}/package.json`).license).toBe(license);
  });

  it('shows the pinned versions the build was made with', () => {
    expect(__APP_DEPENDENCIES__).toEqual(readJson('package.json').dependencies);
  });
});
