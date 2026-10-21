// @vitest-environment node
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { deployDist } from './deploy.mjs';
import { CESIUM_PARTS, checkDist } from './verify.mjs';

/** The page a good build writes. */
const PAGE = `<!doctype html><html><head>
<script>window.CESIUM_BASE_URL = "/cesium/";</script>
<link rel="stylesheet" href="/cesium/Widgets/widgets.css">
<script src="/cesium/Cesium.js"></script>
<script type="module" crossorigin src="/assets/index-DHW4I6OF.js"></script>
</head><body><div id="root"></div></body></html>`;

let dirs = [];

/** A temporary directory, removed after the test. */
function temp() {
  const dir = mkdtempSync(join(tmpdir(), 'fs-dist-'));
  dirs.push(dir);
  return dir;
}

/** A build directory with the given page, holding every Cesium part, the worker and the bundle. */
function build(page = PAGE) {
  const dir = temp();
  writeFileSync(join(dir, 'index.html'), page);
  writeFileSync(join(dir, 'sw.js'), 'self.addEventListener("push", () => {});');
  mkdirSync(join(dir, 'assets'));
  writeFileSync(join(dir, 'assets', 'index-DHW4I6OF.js'), 'console.log("app");');
  mkdirSync(join(dir, 'cesium'));
  for (const part of CESIUM_PARTS) {
    if (part.endsWith('.js')) writeFileSync(join(dir, 'cesium', part), '');
    else mkdirSync(join(dir, 'cesium', part));
  }
  return dir;
}

afterEach(() => {
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
  dirs = [];
});

describe('the production build check', () => {
  it('passes a build with Cesium, its base URL, the worker and no secrets', () => {
    expect(checkDist(build())).toEqual([]);
  });

  it('says when the Cesium base URL is missing or does not match where Cesium loads from', () => {
    expect(checkDist(build(PAGE.replace(/<script>window[^<]*<\/script>/, '')))).toContain(
      'index.html does not set window.CESIUM_BASE_URL.',
    );
    expect(checkDist(build(PAGE.replace('"/cesium/"', '"/static/cesium/"')))).toContain(
      'CESIUM_BASE_URL is /static/cesium/, but Cesium.js loads from /cesium/.',
    );
  });

  it('says which Cesium parts and files are missing', () => {
    const dir = build();
    rmSync(join(dir, 'cesium', 'Workers'), { recursive: true });
    rmSync(join(dir, 'sw.js'));
    expect(checkDist(dir)).toEqual([
      '/cesium/Workers is missing.',
      'sw.js is missing from the root.',
    ]);
    expect(checkDist(temp())[0]).toMatch(/index\.html is missing/);
  });

  it('finds what looks like a token or a key in a built file', () => {
    const dir = build();
    writeFileSync(join(dir, 'assets', 'leak.js'), 'const t = "fsr_abcdefghijklmnopqrstuvwxyz123";');
    expect(checkDist(dir)).toEqual([
      'assets/leak.js contains what looks like a secret: fsr_abcdefgh…',
    ]);
  });
});

describe('the deploy copy', () => {
  it('copies the build into the web root, index.html included, and keeps what was there', () => {
    const dist = build();
    const web = temp();
    writeFileSync(join(web, '.gitkeep'), '');
    writeFileSync(join(web, 'old.js'), '');
    expect(deployDist(dist, web)).toBe(4);
    expect(readFileSync(join(web, 'index.html'), 'utf8')).toBe(PAGE);
    expect(existsSync(join(web, 'cesium', 'Workers'))).toBe(true);
    expect(existsSync(join(web, 'old.js'))).toBe(true);
  });

  it('with clean, removes everything but the placeholder first', () => {
    const dist = build();
    const web = temp();
    writeFileSync(join(web, '.gitkeep'), '');
    writeFileSync(join(web, 'old.js'), '');
    deployDist(dist, web, { clean: true });
    expect(existsSync(join(web, 'old.js'))).toBe(false);
    expect(existsSync(join(web, '.gitkeep'))).toBe(true);
  });

  it('refuses a build without a page, or a web root that is not a directory', () => {
    expect(() => deployDist(temp(), temp())).toThrow(/has no index\.html/);
    expect(() => deployDist(build(), join(temp(), 'nowhere'))).toThrow(/is not a directory/);
  });
});
