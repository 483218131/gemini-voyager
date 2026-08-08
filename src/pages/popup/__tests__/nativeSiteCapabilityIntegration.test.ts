import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('native popup site capability integration', () => {
  it('guards every wrapped section with the platform capability table', () => {
    const popupSource = readFileSync(resolve(process.cwd(), 'src/pages/popup/Popup.tsx'), 'utf8');
    const wrapSectionStart = popupSource.indexOf('const wrapSection = (');
    const wrapSectionEnd = popupSource.indexOf('// Show starred history', wrapSectionStart);
    const wrapSectionSource = popupSource.slice(wrapSectionStart, wrapSectionEnd);

    expect(wrapSectionStart).toBeGreaterThan(-1);
    expect(wrapSectionEnd).toBeGreaterThan(wrapSectionStart);
    expect(wrapSectionSource).toContain('if (!isSectionVisible(id)) return null;');
  });
});
