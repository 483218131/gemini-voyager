import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { validateRegressionNotes } from './validate-regression-notes.mjs';

const temporaryRoots = [];

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) rmSync(root, { force: true, recursive: true });
});

describe('validateRegressionNotes', () => {
  it('accepts a routed note with Trap, Rule, Guard, and an existing guard path', () => {
    const root = createFixture({
      topic: `# Rendering notes

## Keep labels visible

- **Trap:** Labels disappeared after sanitization.
- **Rule:** Preserve safe SVG text.
- **Guard:** \`src/render.test.ts\`
`,
    });
    mkdirSync(path.join(root, 'src'));
    writeFileSync(path.join(root, 'src/render.test.ts'), '');

    expect(validateRegressionNotes(root)).toEqual({
      entryCount: 1,
      errors: [],
      topicCount: 1,
    });
  });

  it('reports unlinked topics and incomplete entries', () => {
    const root = createFixture({
      index: '# Regression Notes\n',
      topic: `# Rendering notes

## Keep labels visible

- **Trap:** Labels disappeared after sanitization.
- **Guard:** Manual browser check.
`,
    });

    const result = validateRegressionNotes(root);
    expect(result.errors).toContain('Topic is not linked from the index: rendering.md');
    expect(result.errors).toContain(
      '.github/docs/regressions/rendering.md#Keep labels visible must contain exactly one Rule field',
    );
  });

  it('reports guard paths that no longer exist', () => {
    const root = createFixture({
      topic: `# Rendering notes

## Keep labels visible

- **Trap:** Labels disappeared after sanitization.
- **Rule:** Preserve safe SVG text.
- **Guard:** \`src/missing.test.ts\`
`,
    });

    expect(validateRegressionNotes(root).errors).toContain(
      '.github/docs/regressions/rendering.md#Keep labels visible references a missing guard path: src/missing.test.ts',
    );
  });

  it('requires test guards to use repository-relative paths', () => {
    const root = createFixture({
      topic: `# Rendering notes

## Keep labels visible

- **Trap:** Labels disappeared after sanitization.
- **Rule:** Preserve safe SVG text.
- **Guard:** \`render.test.ts\`
`,
    });

    expect(validateRegressionNotes(root).errors).toContain(
      '.github/docs/regressions/rendering.md#Keep labels visible must use a repository-relative path for guard test: render.test.ts',
    );
  });
});

function createFixture({
  index = '# Regression Notes\n\n[Rendering](regressions/rendering.md)\n',
  topic,
}) {
  const root = mkdtempSync(path.join(tmpdir(), 'voyager-regressions-'));
  temporaryRoots.push(root);
  mkdirSync(path.join(root, '.github/docs/regressions'), { recursive: true });
  writeFileSync(path.join(root, '.github/docs/REGRESSION_NOTES.md'), index);
  writeFileSync(path.join(root, '.github/docs/regressions/rendering.md'), topic);
  return root;
}
