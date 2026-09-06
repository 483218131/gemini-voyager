import { afterEach, describe, expect, it } from 'vitest';

import { type SentPromptChipsController, startSentPromptChips } from '../SentPromptChips';

const fable = {
  id: 'fable',
  name: '寓言写作',
  text: '# 寓言写作 Prompt\n\n围绕 {{concept}} 这个概念，写一则寓言来完整地解释它。\n要像真正的寓言那样间接讲，不要直接点破。',
};

const FABLE_LINES = [
  '# 寓言写作 Prompt',
  '',
  '围绕 hihi 这个概念，写一则寓言来完整地解释它。',
  '要像真正的寓言那样间接讲，不要直接点破。',
];

let controller: SentPromptChipsController | null = null;

/**
 * The shape a real Gemini turn has, read off gemini.google.com: one
 * `.query-text-line` per authored line, plus the copy and expand controls,
 * whose Material Symbols glyph *is* the element's own text.
 */
function mountTurn(lines: string[], withControls = true): HTMLElement {
  const turn = document.createElement('span');
  turn.className = 'user-query-bubble-with-background';
  const wrap = document.createElement('div');
  wrap.className = 'query-text';
  for (const line of lines) {
    const p = document.createElement('p');
    p.className = 'query-text-line';
    p.textContent = line;
    wrap.appendChild(p);
  }
  turn.appendChild(wrap);
  if (withControls) {
    turn.insertAdjacentHTML(
      'beforeend',
      '<button aria-label="copy"><mat-icon>content_copy</mat-icon></button>' +
        '<button aria-label="expand"><mat-icon>expand_more</mat-icon></button>',
    );
  }
  document.body.appendChild(turn);
  return turn;
}

function start(prompts = [fable]): SentPromptChipsController {
  controller = startSentPromptChips({ prompts });
  return controller;
}

function visibleLines(turn: HTMLElement): string[] {
  return [...turn.querySelectorAll<HTMLElement>('.query-text-line')]
    .filter((line) => !line.classList.contains('gv-pm-sent-line'))
    .map((line) => line.textContent ?? '');
}

afterEach(() => {
  controller?.destroy();
  controller = null;
  document.body.innerHTML = '';
});

describe('SentPromptChips', () => {
  it('collapses a sent prompt to its name and leaves the message in the DOM', () => {
    const turn = mountTurn(FABLE_LINES);

    start();

    expect(turn.querySelector('.gv-pm-sent-chip')?.textContent).toBe('寓言写作');
    // Gemini owns these nodes; hiding is a class, never a removal, because the
    // bubble is re-rendered on navigation.
    expect(turn.querySelectorAll('.query-text-line')).toHaveLength(FABLE_LINES.length);
    expect(visibleLines(turn)).toEqual([]);
  });

  it('keeps what the person typed on a line of their own', () => {
    // A slash token leaves the composer editable. Collapsing the appended
    // sentence would hide the only part of the turn that is actually theirs.
    const turn = mountTurn([...FABLE_LINES, '再补充一点要求']);

    start();

    expect(turn.querySelector('.gv-pm-sent-chip')?.textContent).toBe('寓言写作');
    expect(visibleLines(turn)).toEqual(['再补充一点要求']);
  });

  it("keeps what the person typed onto the prompt's own last line", () => {
    // Measured on gemini.google.com: typing after the token appends to that
    // line, so the boundary falls inside it and there is no line to leave
    // showing. The remainder comes back as our own element instead.
    const merged = [...FABLE_LINES.slice(0, -1), FABLE_LINES[FABLE_LINES.length - 1] + '大大'];
    const turn = mountTurn(merged);

    start();

    expect(turn.querySelector('.gv-pm-sent-chip')?.textContent).toBe('寓言写作');
    expect(turn.querySelector('.gv-pm-sent-rest')?.textContent).toBe('大大');
    expect(visibleLines(turn)).toEqual([]);
  });

  it('reveals the prompt when the chip is clicked, and hides it again', () => {
    const turn = mountTurn([...FABLE_LINES, '再补充一点要求']);
    start();
    const chip = turn.querySelector<HTMLElement>('.gv-pm-sent-chip');

    chip?.click();
    expect(visibleLines(turn)).toEqual([...FABLE_LINES, '再补充一点要求']);
    expect(chip?.getAttribute('aria-expanded')).toBe('true');

    chip?.click();
    expect(visibleLines(turn)).toEqual(['再补充一点要求']);
    expect(chip?.getAttribute('aria-expanded')).toBe('false');
  });

  it('ignores the icon-font controls beside the message', () => {
    // Reading the bubble wholesale drags `content_copy` and `expand_more` into
    // the message, and no anchored pattern can match after that.
    const turn = mountTurn(FABLE_LINES);

    start();

    expect(turn.querySelector('.gv-pm-sent-chip')).not.toBeNull();
  });

  it('leaves an ordinary message untouched', () => {
    const turn = mountTurn(['帮我看看这段代码']);

    start();

    expect(turn.querySelector('.gv-pm-sent-chip')).toBeNull();
    expect(turn.classList.contains('gv-pm-sent-collapsed')).toBe(false);
  });

  it('does not match its own chip label back into the message', () => {
    const turn = mountTurn(FABLE_LINES);
    const instance = start();

    const first = turn.querySelector('.gv-pm-sent-chip');
    instance.refresh();
    instance.refresh();

    expect(turn.querySelectorAll('.gv-pm-sent-chip')).toHaveLength(1);
    expect(turn.querySelector('.gv-pm-sent-chip')).toBe(first);
  });

  it('releases a turn whose prompt was deleted', () => {
    const turn = mountTurn(FABLE_LINES);
    const instance = start();
    expect(turn.querySelector('.gv-pm-sent-chip')).not.toBeNull();

    instance.setPrompts([]);

    expect(turn.querySelector('.gv-pm-sent-chip')).toBeNull();
    expect(turn.classList.contains('gv-pm-sent-collapsed')).toBe(false);
    expect(visibleLines(turn)).toEqual(FABLE_LINES);
  });

  it('relabels a turn when its prompt is renamed', () => {
    const turn = mountTurn(FABLE_LINES);
    const instance = start();

    instance.setPrompts([{ ...fable, name: '新名字' }]);

    expect(turn.querySelectorAll('.gv-pm-sent-chip')).toHaveLength(1);
    expect(turn.querySelector('.gv-pm-sent-chip')?.textContent).toBe('新名字');
  });

  it('leaves Gemini exactly as it found it on teardown', () => {
    const merged = [...FABLE_LINES.slice(0, -1), FABLE_LINES[FABLE_LINES.length - 1] + '大大'];
    const turn = mountTurn(merged);
    const before = turn.outerHTML;
    const instance = start();
    expect(turn.outerHTML).not.toBe(before);

    instance.destroy();
    controller = null;

    expect(turn.outerHTML).toBe(before);
  });
});

describe("SentPromptChips and Gemini's own show-more control", () => {
  function mountWithToggle(lines: string[]): {
    turn: HTMLElement;
    toggle: HTMLElement;
    button: HTMLButtonElement;
  } {
    const turn = mountTurn(lines);
    const toggle = document.createElement('div');
    toggle.className = 'luminous-toggle-container';
    const button = document.createElement('button');
    button.setAttribute('data-test-id', 'luminous-expand-button');
    toggle.appendChild(button);
    turn.appendChild(toggle);
    return { turn, toggle, button };
  }

  it('hides the control that would toggle the text this chip already hides', () => {
    const { turn, toggle } = mountWithToggle(FABLE_LINES);

    start();

    expect(toggle.classList.contains('gv-pm-sent-toggle-hidden')).toBe(true);
    turn.querySelector<HTMLElement>('.gv-pm-sent-chip')?.click();
    expect(toggle.classList.contains('gv-pm-sent-toggle-hidden')).toBe(false);
  });

  it("presses Gemini's own button instead of stripping its clamp", () => {
    // Removing the class looked right for a frame and then fought back: Gemini
    // owns that state and re-applies it, which is the grow-then-shrink flicker.
    // Going through its control lets it run the transition itself.
    const { turn, button } = mountWithToggle(FABLE_LINES);
    const clamp = turn.querySelector<HTMLElement>('.query-text') as HTMLElement;
    clamp.classList.add('collapsed');
    let pressed = 0;
    button.addEventListener('click', () => pressed++);

    start();
    expect(pressed).toBe(0);
    // The class is never touched here; only Gemini may clear it.
    expect(clamp.classList.contains('collapsed')).toBe(true);

    turn.querySelector<HTMLElement>('.gv-pm-sent-chip')?.click();
    expect(pressed).toBe(1);
    expect(clamp.classList.contains('collapsed')).toBe(true);
  });

  it('leaves an unclamped turn alone', () => {
    const { turn, button } = mountWithToggle(FABLE_LINES);
    let pressed = 0;
    button.addEventListener('click', () => pressed++);

    start();
    turn.querySelector<HTMLElement>('.gv-pm-sent-chip')?.click();

    expect(pressed).toBe(0);
  });

  it('gives the control back on teardown, even while expanded', () => {
    const { turn, toggle } = mountWithToggle(FABLE_LINES);
    const instance = start();
    turn.querySelector<HTMLElement>('.gv-pm-sent-chip')?.click();

    instance.destroy();
    controller = null;

    expect(toggle.classList.contains('gv-pm-sent-toggle-hidden')).toBe(false);
  });
});

describe('SentPromptChips across a Gemini re-render', () => {
  it('stays open on a turn the reader opened, even after the nodes are replaced', () => {
    // Pressing Gemini's expand button makes it re-render the turn: measured on
    // gemini.google.com, the bubble went to zero height mid-click while Angular
    // swapped the nodes. Re-collapsing the replacement is the grow-then-shrink
    // flicker, so the open state has to key off the message, not the element.
    const turn = mountTurn(FABLE_LINES);
    const instance = start();
    turn.querySelector<HTMLElement>('.gv-pm-sent-chip')?.click();
    expect(visibleLines(turn)).toEqual(FABLE_LINES);

    turn.remove();
    const replacement = mountTurn(FABLE_LINES);
    instance.refresh();

    expect(replacement.querySelector('.gv-pm-sent-chip')).not.toBeNull();
    expect(visibleLines(replacement)).toEqual(FABLE_LINES);
  });

  it('collapses a replacement the reader had not opened', () => {
    const turn = mountTurn(FABLE_LINES);
    const instance = start();
    expect(visibleLines(turn)).toEqual([]);

    turn.remove();
    const replacement = mountTurn(FABLE_LINES);
    instance.refresh();

    expect(visibleLines(replacement)).toEqual([]);
  });

  it('forgets the open state once the chip is collapsed again', () => {
    const turn = mountTurn(FABLE_LINES);
    const instance = start();
    const chip = () => turn.querySelector<HTMLElement>('.gv-pm-sent-chip');
    chip()?.click();
    chip()?.click();

    turn.remove();
    const replacement = mountTurn(FABLE_LINES);
    instance.refresh();

    expect(visibleLines(replacement)).toEqual([]);
  });
});
