import { describe, expect, it } from 'vitest';

import { compilePrompts, matchCompiledPrompt, matchSentPrompt } from '../promptTextMatch';

const fable = {
  id: 'fable',
  name: '寓言写作',
  text: '围绕 {{concept}} 这个概念，写一则寓言来完整地解释它。\n要像真正的寓言那样间接讲，不要直接点破。',
};

const plain = {
  id: 'plain',
  name: '论文速读',
  text: '把这篇论文的方法与贡献讲清楚。\n\n不要写摘要。',
};

describe('promptTextMatch', () => {
  it('recognises a template message by the values that were filled in', () => {
    const sent =
      '围绕 Forward Deployed Engineer (FDE) 这个概念，写一则寓言来完整地解释它。 要像真正的寓言那样间接讲，不要直接点破。';

    expect(matchSentPrompt(sent, [fable])?.name).toBe('寓言写作');
  });

  it('recognises a message whose placeholder was left unfilled', () => {
    // `fillPromptTemplate` sends the literal `{{name}}` for a blank variable,
    // so the sent text still has to resolve to the same prompt.
    const sent =
      '围绕 {{concept}} 这个概念，写一则寓言来完整地解释它。 要像真正的寓言那样间接讲，不要直接点破。';

    expect(matchSentPrompt(sent, [fable])?.name).toBe('寓言写作');
  });

  it('ignores the newlines Gemini drops when it re-renders the message', () => {
    // The bubble is block markup, so `textContent` runs the paragraphs together
    // and the composer's token spacer can leave a trailing space behind.
    const sent = '把这篇论文的方法与贡献讲清楚。 不要写摘要。 ';

    expect(matchSentPrompt(sent, [plain])?.name).toBe('论文速读');
  });

  it('leaves an ordinary message alone', () => {
    expect(matchSentPrompt('帮我看看这段代码', [fable, plain])).toBeNull();
    expect(matchSentPrompt('', [fable, plain])).toBeNull();
  });

  it('does not let a template claim more than it actually pinned down', () => {
    const sent = '围绕 X 这个概念，写一则寓言来完整地解释它。 然后再补一段完全无关的话。';

    expect(matchSentPrompt(sent, [fable])).toBeNull();
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
    expect(matchSentPrompt('把这篇论文的方法与贡献讲清楚。', [unnamed, empty])).toBeNull();
  });

  it('treats regex metacharacters in a body as literal text', () => {
    const risky = { id: 'risky', name: '正则', text: '匹配 a.c 和 (x|y) 与 {{what}} 结尾' };

    expect(matchSentPrompt('匹配 a.c 和 (x|y) 与 结果 结尾', [risky])?.name).toBe('正则');
    // `.` must not stand in for an arbitrary character.
    expect(matchSentPrompt('匹配 abc 和 (x|y) 与 结果 结尾', [risky])).toBeNull();
  });

  it('compiles once for many turns', () => {
    const compiled = compilePrompts([fable, plain]);

    expect(
      matchCompiledPrompt(['把这篇论文的方法与贡献讲清楚。', '不要写摘要。'], compiled)?.id,
    ).toBe('plain');
    expect(matchCompiledPrompt(['帮我看看这段代码'], compiled)).toBeNull();
  });
});

describe('promptTextMatch across block markup', () => {
  // Gemini renders a multi-line prompt as separate blocks, and `textContent`
  // joins them with nothing at all. Collapsing the prompt's own newlines to a
  // single space leaves a space on one side and nothing on the other, so a
  // real multi-line prompt never matched.
  const heading = {
    id: 'heading',
    name: '寓言写作',
    text: '# 寓言写作 Prompt\n\n围绕 {{concept}} 这个概念，写一则寓言来完整地解释它。\n要像真正的寓言那样间接讲，不要直接点破。',
  };

  it('matches a multi-line prompt whose newlines the renderer dropped', () => {
    const sent =
      '# 寓言写作 Prompt围绕 FDE 这个概念，写一则寓言来完整地解释它。要像真正的寓言那样间接讲，不要直接点破。';

    expect(matchSentPrompt(sent, [heading])?.name).toBe('寓言写作');
  });

  it('matches the same prompt when the renderer keeps the newlines', () => {
    expect(matchSentPrompt(heading.text.replace('{{concept}}', 'FDE'), [heading])?.name).toBe(
      '寓言写作',
    );
  });
});

describe('promptTextMatch when the person kept typing', () => {
  // A slash token leaves the composer editable, so appending to the prompt is
  // ordinary use. Anchoring both ends made any such turn unrecognisable, and
  // collapsing all of it would have hidden the sentence the person wrote.
  const fableLines = [
    '# 寓言写作 Prompt',
    '',
    '围绕 hihi 这个概念，写一则寓言来完整地解释它。',
    '要像真正的寓言那样间接讲，不要直接点破。',
  ];
  const prompt = {
    id: 'fable',
    name: '寓言写作',
    text: '# 寓言写作 Prompt\n\n围绕 {{concept}} 这个概念，写一则寓言来完整地解释它。\n要像真正的寓言那样间接讲，不要直接点破。',
  };

  it('reports the whole turn when nothing was appended', () => {
    const match = matchSentPrompt(fableLines, [prompt]);

    expect(match?.name).toBe('寓言写作');
    expect(match?.lineCount).toBe(fableLines.length);
  });

  it('recognises the prompt and stops where the person took over', () => {
    const match = matchSentPrompt([...fableLines, '大大', '再补充一点要求'], [prompt]);

    expect(match?.name).toBe('寓言写作');
    // The appended lines are not the prompt's, and must stay visible.
    expect(match?.lineCount).toBe(fableLines.length);
    expect(match?.remainder).toBe('');
  });

  it('does not claim a turn that merely ends the same way', () => {
    const tail = fableLines.slice(1);

    expect(matchSentPrompt(['先说点别的', ...tail], [prompt])).toBeNull();
  });

  it('finds the boundary inside a line when the person typed straight on', () => {
    // Measured on gemini.google.com: typing after the token appends to the
    // prompt's own last line. Requiring a line boundary made every such turn
    // unrecognisable, which is what this feature kept failing on.
    const merged = [...fableLines.slice(0, -1), fableLines[fableLines.length - 1] + '大大'];
    const match = matchSentPrompt(merged, [prompt]);

    expect(match?.name).toBe('寓言写作');
    expect(match?.lineCount).toBe(merged.length);
    expect(match?.remainder).toBe('大大');
  });
});
