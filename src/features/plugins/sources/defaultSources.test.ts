import { describe, expect, it } from 'vitest';

import type { PluginManifest, PluginSource } from '../types';
import {
  createDefaultPluginSources,
  listPluginManifests,
  listPluginManifestsWithSources,
} from './defaultSources';

function manifest(id: string, name = id): PluginManifest {
  return {
    id,
    name,
    version: '1.0.0',
    description: 'test',
    author: 'test',
    category: 'other',
    license: 'MIT',
    engine: '>=1.0.0',
    tier: 'declarative',
    matches: ['https://example.com/*'],
    contributes: {},
  };
}

class StaticSource implements PluginSource {
  constructor(
    readonly id: string,
    private readonly manifests: readonly PluginManifest[],
  ) {}

  async list(): Promise<readonly PluginManifest[]> {
    return this.manifests;
  }
}

describe('default plugin sources', () => {
  it('serves native then bundled official catalog (remote marketplace disabled)', () => {
    expect(createDefaultPluginSources().map((source) => source.id)).toEqual([
      'builtin',
      'bundled-catalog',
    ]);
  });

  it('dedupes manifests with the first source winning', async () => {
    const result = await listPluginManifests([
      new StaticSource('builtin', [manifest('voyager.native')]),
      new StaticSource('bundled-catalog', [manifest('voyager.same', 'official')]),
      new StaticSource('marketplace', [
        manifest('voyager.same', 'remote'),
        manifest('voyager.remote'),
      ]),
    ]);

    expect(result.map((plugin) => `${plugin.id}:${plugin.name}`)).toEqual([
      'voyager.native:voyager.native',
      'voyager.same:official',
      'voyager.remote:voyager.remote',
    ]);
  });

  it('retains only the safe source id for diagnostics', async () => {
    const result = await listPluginManifestsWithSources([
      new StaticSource('builtin', [manifest('voyager.same', 'native')]),
      new StaticSource('marketplace', [
        manifest('voyager.same', 'remote duplicate'),
        manifest('voyager.remote'),
      ]),
    ]);

    expect(result.map(({ manifest: plugin, sourceId }) => `${plugin.id}:${sourceId}`)).toEqual([
      'voyager.same:builtin',
      'voyager.remote:marketplace',
    ]);
  });
});
