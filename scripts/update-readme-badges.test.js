import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const repositoryRoot = process.cwd();
const hostedBadgeBase = 'https://voyager.nagi.fun/badges';
const badgeNames = ['stars', 'forks', 'release', 'downloads'];
const readmePaths = [
  'README.md',
  '.github/README_AR.md',
  '.github/README_ES.md',
  '.github/README_FR.md',
  '.github/README_JA.md',
  '.github/README_KO.md',
  '.github/README_PT.md',
  '.github/README_RU.md',
  '.github/README_ZH.md',
  '.github/README_ZH_TW.md',
];

function readRepositoryFile(path) {
  return readFileSync(resolve(repositoryRoot, path), 'utf8');
}

describe('README badge publishing', () => {
  it('publishes generated badges through the docs deployment without committing them', () => {
    const workflow = readRepositoryFile('.github/workflows/deploy-docs.yml');

    expect(workflow).toContain("cron: '17 3 * * *'");
    expect(workflow).toContain('node scripts/update-readme-badges.mjs');
    expect(existsSync(resolve(repositoryRoot, '.github/workflows/update-readme-badges.yml'))).toBe(
      false,
    );
  });

  it.each(readmePaths)('%s uses the hosted badge source', (readmePath) => {
    const readme = readRepositoryFile(readmePath);

    for (const badgeName of badgeNames) {
      expect(readme).toContain(`${hostedBadgeBase}/github-${badgeName}.svg`);
    }
  });

  it('fetches metrics from the current repository slug', () => {
    const generator = readRepositoryFile('scripts/update-readme-badges.mjs');

    expect(generator).toContain("const repo = 'voyager';");
    expect(generator).not.toContain("const repo = 'gemini-voyager';");
  });
});
