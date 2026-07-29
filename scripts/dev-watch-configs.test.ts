import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('browser development watchers', () => {
  it.each(['chrome', 'firefox', 'safari'])('rebuilds %s when public assets change', (browser) => {
    const config = JSON.parse(
      readFileSync(resolve(process.cwd(), `nodemon.${browser}.json`), 'utf8'),
    ) as { watch?: string[] };

    expect(config.watch).toContain('public');
  });
});
