import { describe, expect, it } from 'vitest';

import { compilePrompts, matchCompiledPrompt, matchSentPrompt } from '../promptTextMatch';

const fable = {
  id: 'fable',
  name: '寓言写作',
  text: '# 寓言写作 Prompt\n\n围绕 {{concept}} 这个概念，写一则寓言来完整地解释它。\n要像真正的寓言那样间接讲，不要直接点破。',
};

const plain = {
  id: 'plain',
  name: '论文速读',
  text: '把这篇论文的方法与贡献讲清楚。\n\n不要写摘要。',
};

/** What `.query-text-line` reading gives back: one newline between blocks. */
const rendered = (...lines: string[]): string => lines.join('\n');

const SENT = rendered(
  '# 寓言写作 Prompt',
  '',
  '围绕 hihi 这个概念，写一则寓言来完整地解释它。',
  '要像真正的寓言那样间接讲，不要直接点破。',
);

describe('promptTextMatch', () => {
  it('recognises a template message by the values that were filled in', () => {
    expect(matchSentPrompt(SENT, [fable])?.name).toBe('寓言写作');
  });

  it('locates what was typed into each placeholder', () => {
    // Without this the expanded prompt reads as one undifferentiated wall and
    // the reader cannot tell their own answer from the template around it.
    const match = matchSentPrompt(SENT, [fable]);
    const values = (match?.values ?? []).map(([start, end]) => SENT.slice(start, end));

    expect(values).toEqual(['hihi']);
  });

  it('locates every placeholder of a body that has several', () => {
    const two = { id: 'two', name: '两个', text: '把 {{what}} 翻译成 {{lang}}，保持语气。' };
    const sent = '把 这段代码注释 翻译成 法语，保持语气。';
    const match = matchSentPrompt(sent, [two]);

    expect((match?.values ?? []).map(([s, e]) => sent.slice(s, e))).toEqual([
      '这段代码注释',
      '法语',
    ]);
  });

  it('marks nothing when the placeholder was left blank', () => {
    // `fillPromptTemplate` sends the literal `{{name}}` for a blank variable,
    // so the turn still resolves to the prompt - the braces are just its text.
    const sent = SENT.replace('hihi', '{{concept}}');
    const match = matchSentPrompt(sent, [fable]);

    expect(match?.name).toBe('寓言写作');
    expect((match?.values ?? []).map(([s, e]) => sent.slice(s, e))).toEqual(['{{concept}}']);
  });

  it('absorbs the padding each rendered line carries', () => {
    // Read off gemini.google.com, a line comes back as `" # 寓言写作 Prompt "`.
    // Anchoring hard against the prompt's first character missed every turn.
    const padded = SENT.split('\n')
      .map((line) => (line ? ` ${line} ` : line))
      .join('\n');

    expect(matchSentPrompt(padded, [fable])?.name).toBe('寓言写作');
    const match = matchSentPrompt(padded, [fable]);
    expect((match?.values ?? []).map(([s2, e2]) => padded.slice(s2, e2))).toEqual(['hihi']);
  });

  it('absorbs the blank lines the renderer collapses', () => {
    // The body was authored with `\n\n` between blocks; reading the turn back
    // gives a single newline, or none at all.
    expect(matchSentPrompt('把这篇论文的方法与贡献讲清楚。\n不要写摘要。', [plain])?.name).toBe(
      '论文速读',
    );
    expect(matchSentPrompt('把这篇论文的方法与贡献讲清楚。不要写摘要。', [plain])?.name).toBe(
      '论文速读',
    );
  });

  it('reports where the prompt stops when the person kept typing', () => {
    // Measured on gemini.google.com: the prompt ended and `大大` followed on the
    // same line, with no newline between them.
    const sent = `${SENT}大大`;
    const match = matchSentPrompt(sent, [fable]);

    expect(match?.name).toBe('寓言写作');
    expect(sent.slice(match?.end)).toBe('大大');
  });

  it('reports the whole message when nothing was appended', () => {
    expect(matchSentPrompt(SENT, [fable])?.end).toBe(SENT.length);
  });

  it('leaves an ordinary message alone', () => {
    expect(matchSentPrompt('帮我看看这段代码', [fable, plain])).toBeNull();
    expect(matchSentPrompt('   ', [fable, plain])).toBeNull();
  });

  it('does not claim a message that merely ends the same way', () => {
    expect(matchSentPrompt(`先说点别的\n${SENT}`, [fable])).toBeNull();
  });

  it('refuses a body that is little more than a placeholder', () => {
    // `{{x}}` alone compiles to a pattern that matches every message ever sent.
    const greedy = { id: 'greedy', name: '万能', text: '{{x}}' };
    const thin = { id: 'thin', name: '标题', text: '# {{t}}' };

    expect(matchSentPrompt('随便一句话', [greedy])).toBeNull();
    expect(matchSentPrompt('# 任意标题', [thin])).toBeNull();
  });

  it('prefers the prompt that explains more of the message', () => {
    const loose = { id: 'loose', name: '宽松', text: '围绕 {{a}} 写' };
    const tight = { id: 'tight', name: '严格', text: '围绕 {{a}} 写一则寓言' };
    const sent = '围绕 沉没成本 写一则寓言';

    expect(matchSentPrompt(sent, [loose, tight])?.name).toBe('严格');
    // Order in the list must not decide it.
    expect(matchSentPrompt(sent, [tight, loose])?.name).toBe('严格');
  });

  it('skips prompts that could not label anything', () => {
    const unnamed = { id: 'unnamed', name: '   ', text: '把这篇论文的方法与贡献讲清楚。' };
    const empty = { id: 'empty', name: '空的', text: '' };

    expect(compilePrompts([unnamed, empty])).toHaveLength(0);
  });

  it('treats regex metacharacters in a body as literal text', () => {
    const risky = { id: 'risky', name: '正则', text: '匹配 a.c 和 (x|y) 与 {{what}} 结尾' };

    expect(matchSentPrompt('匹配 a.c 和 (x|y) 与 结果 结尾', [risky])?.name).toBe('正则');
    // `.` must not stand in for an arbitrary character.
    expect(matchSentPrompt('匹配 abc 和 (x|y) 与 结果 结尾', [risky])).toBeNull();
  });

  it('is built without RegExp match indices, which Safari 15.4 lacks', () => {
    // The `d` flag arrived in Safari 16.4, the same floor that already rules
    // out lookbehind. Offsets come from summing capture lengths instead.
    for (const compiled of compilePrompts([fable, plain])) {
      expect((compiled as unknown as { pattern: RegExp }).pattern.flags).not.toContain('d');
    }
  });

  it('compiles once for many turns', () => {
    const compiled = compilePrompts([fable, plain]);

    expect(matchCompiledPrompt('把这篇论文的方法与贡献讲清楚。\n不要写摘要。', compiled)?.id).toBe(
      'plain',
    );
    expect(matchCompiledPrompt('帮我看看这段代码', compiled)).toBeNull();
  });
});
