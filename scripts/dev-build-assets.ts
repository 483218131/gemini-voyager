import { existsSync, readFileSync, readdirSync, rmSync } from 'fs';
import { posix, resolve, sep } from 'path';

type ViteManifestEntry = {
  readonly assets?: unknown;
  readonly css?: unknown;
  readonly file?: unknown;
};

function normalizeAssetPath(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const slashPath = value.replaceAll('\\', '/');
  const normalized = posix.normalize(slashPath);
  if (!normalized.startsWith('assets/') || normalized.includes('../')) return null;
  return normalized;
}

function addGeneratedAsset(target: Set<string>, value: unknown): void {
  const assetPath = normalizeAssetPath(value);
  if (!assetPath) return;
  target.add(assetPath);
  if (/\.(?:css|[cm]?js)$/i.test(assetPath)) target.add(`${assetPath}.map`);
}

/** Read only emitted asset paths from a prior Vite manifest. */
export function readViteManifestAssetPaths(manifestPath: string): Set<string> {
  if (!existsSync(manifestPath)) return new Set();
  try {
    const raw = JSON.parse(readFileSync(manifestPath, 'utf8')) as unknown;
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return new Set();

    const assets = new Set<string>();
    for (const entry of Object.values(raw as Record<string, ViteManifestEntry>)) {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue;
      addGeneratedAsset(assets, entry.file);
      if (Array.isArray(entry.css)) entry.css.forEach((file) => addGeneratedAsset(assets, file));
      if (Array.isArray(entry.assets)) {
        entry.assets.forEach((file) => addGeneratedAsset(assets, file));
      }
    }
    return assets;
  } catch {
    return new Set();
  }
}

/** Convert Rollup bundle keys into the asset paths produced by this build. */
export function collectBundleAssetPaths(fileNames: Iterable<string>): Set<string> {
  const assets = new Set<string>();
  for (const fileName of fileNames) addGeneratedAsset(assets, fileName);
  return assets;
}

export function shouldPruneDevBuildAssets(
  hadPreviousManifest: boolean,
  previousAssetCount: number,
): boolean {
  return !hadPreviousManifest || previousAssetCount > 0;
}

/** Preserve files copied verbatim from public/assets, including hashed-looking names. */
export function collectStaticAssetPaths(directory: string, relativePrefix = 'assets'): Set<string> {
  const assets = new Set<string>();
  if (!existsSync(directory)) return assets;

  const visit = (currentDirectory: string, currentPrefix: string): void => {
    for (const entry of readdirSync(currentDirectory, { withFileTypes: true })) {
      const entryPath = resolve(currentDirectory, entry.name);
      const relativePath = posix.join(currentPrefix, entry.name);
      if (entry.isDirectory()) visit(entryPath, relativePath);
      else if (entry.isFile()) assets.add(relativePath);
    }
  };
  visit(directory, relativePrefix);
  return assets;
}

function isViteHashedAsset(assetPath: string): boolean {
  return /-[A-Za-z0-9_-]{8,}\.[A-Za-z0-9.]+$/i.test(posix.basename(assetPath));
}

/**
 * Delete only old, content-hashed files under outDir/assets. Stable or unknown
 * files are left alone, so cleanup never treats the generated directory as an
 * unrestricted recursive-delete target.
 */
export function pruneDevBuildAssets(outDir: string, keepAssetPaths: ReadonlySet<string>): string[] {
  const assetsDirectory = resolve(outDir, 'assets');
  if (!existsSync(assetsDirectory)) return [];

  const deleted: string[] = [];
  const visit = (currentDirectory: string, currentPrefix: string): void => {
    for (const entry of readdirSync(currentDirectory, { withFileTypes: true })) {
      const entryPath = resolve(currentDirectory, entry.name);
      if (!entryPath.startsWith(`${assetsDirectory}${sep}`)) continue;
      const relativePath = posix.join(currentPrefix, entry.name);
      if (entry.isDirectory()) {
        visit(entryPath, relativePath);
        continue;
      }
      if (entry.isFile() && isViteHashedAsset(relativePath) && !keepAssetPaths.has(relativePath)) {
        rmSync(entryPath);
        deleted.push(relativePath);
      }
    }
  };
  visit(assetsDirectory, 'assets');
  return deleted.sort();
}
