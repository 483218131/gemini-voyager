import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { dirname, join } from 'path';
import { afterEach, describe, expect, it } from 'vitest';

import {
  collectBundleAssetPaths,
  collectStaticAssetPaths,
  pruneDevBuildAssets,
  readViteManifestAssetPaths,
  shouldPruneDevBuildAssets,
} from './dev-build-assets';

const temporaryDirectories: string[] = [];

function temporaryDirectory(): string {
  const directory = mkdtempSync(join(tmpdir(), 'voyager-dev-assets-'));
  temporaryDirectories.push(directory);
  return directory;
}

function writeFixture(root: string, relativePath: string, contents = 'fixture'): void {
  const filePath = join(root, relativePath);
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, contents);
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('dev build asset pruning', () => {
  it('collects prior manifest assets and their sourcemaps', () => {
    const root = temporaryDirectory();
    const manifestPath = join(root, '.vite', 'manifest.json');
    writeFixture(
      root,
      '.vite/manifest.json',
      JSON.stringify({
        entry: {
          file: 'assets/index-ABCDEFGH.js',
          css: ['assets/style-HIJKLMNO.css'],
          assets: ['assets/font-PQRSTUVW.woff2', '../outside-secret.txt'],
        },
        malformed: { file: 123, css: 'not-an-array' },
      }),
    );

    expect([...readViteManifestAssetPaths(manifestPath)].sort()).toEqual([
      'assets/font-PQRSTUVW.woff2',
      'assets/index-ABCDEFGH.js',
      'assets/index-ABCDEFGH.js.map',
      'assets/style-HIJKLMNO.css',
      'assets/style-HIJKLMNO.css.map',
    ]);
  });

  it('collects the current Rollup generation without accepting paths outside assets', () => {
    expect(
      [
        ...collectBundleAssetPaths([
          'assets/index-ABCDEFGH.js',
          'assets/style-HIJKLMNO.css',
          'manifest.json',
          '../outside-PQRSTUVW.js',
        ]),
      ].sort(),
    ).toEqual([
      'assets/index-ABCDEFGH.js',
      'assets/index-ABCDEFGH.js.map',
      'assets/style-HIJKLMNO.css',
      'assets/style-HIJKLMNO.css.map',
    ]);
  });

  it('keeps current, previous, and static assets while deleting older hashed generations', () => {
    const root = temporaryDirectory();
    const publicAssets = join(root, 'public-assets');
    const files = [
      'assets/index-ABCDEFGH.js',
      'assets/index-ABCDEFGH.js.map',
      'assets/index-HIJKLMNO.js',
      'assets/index-HIJKLMNO.js.map',
      'assets/index-PQRSTUVW.js',
      'assets/index-PQRSTUVW.js.map',
      'assets/chunks/lazy-12345678.js',
      'assets/manual.js',
      'assets/readme.txt',
      'assets/vendor-STATIC12.js',
    ];
    files.forEach((file) => writeFixture(root, file));
    writeFixture(publicAssets, 'vendor-STATIC12.js');

    const keep = new Set([
      ...collectBundleAssetPaths(['assets/index-ABCDEFGH.js']),
      ...collectBundleAssetPaths(['assets/index-HIJKLMNO.js']),
      ...collectStaticAssetPaths(publicAssets),
    ]);
    const deleted = pruneDevBuildAssets(root, keep);

    expect(deleted).toEqual([
      'assets/chunks/lazy-12345678.js',
      'assets/index-PQRSTUVW.js',
      'assets/index-PQRSTUVW.js.map',
    ]);
    expect(existsSync(join(root, 'assets/index-ABCDEFGH.js.map'))).toBe(true);
    expect(existsSync(join(root, 'assets/index-HIJKLMNO.js.map'))).toBe(true);
    expect(existsSync(join(root, 'assets/vendor-STATIC12.js'))).toBe(true);
    expect(existsSync(join(root, 'assets/manual.js'))).toBe(true);
    expect(existsSync(join(root, 'assets/readme.txt'))).toBe(true);
  });

  it('skips cleanup when an existing manifest is unreadable', () => {
    expect(shouldPruneDevBuildAssets(true, 0)).toBe(false);
    expect(shouldPruneDevBuildAssets(true, 10)).toBe(true);
    expect(shouldPruneDevBuildAssets(false, 0)).toBe(true);
  });
});
