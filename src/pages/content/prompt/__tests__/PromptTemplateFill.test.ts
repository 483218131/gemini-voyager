import { afterEach, describe, expect, it, vi } from 'vitest';

import { highlightTemplateVariables, openTemplateFill } from '../PromptTemplateFill';

const labels = { insert: '插入', keepRaw: '保持原样', title: '填写变量' };

function anchor(): HTMLElement {
  const el = document.createElement('div');
  document.body.appendChild(el);
  return el;
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('openTemplateFill', () => {
  it('lays the slots out inside the sentence they belong to', () => {
    const onSubmit = vi.fn();
    const handle = openTemplateFill({
      text: '围绕 {{concept}} 用 {{tone}} 的语气写',
      anchor: anchor(),
      theme: 'dark',
      labels,
      onSubmit,
    });

    const surface = document.querySelector('.gv-pm-fill') as HTMLElement;
    // The text either side of a slot is what makes this readable as a sentence.
    expect(surface.querySelector('.gv-pm-fill-doc')?.textContent).toContain('围绕');
    expect(surface.querySelector('.gv-pm-fill-doc')?.textContent).toContain('的语气写');
    expect(handle.slots.map((s) => s.dataset.gvVar)).toEqual(['concept', 'tone']);
    expect(handle.slots[0].dataset.gvPlaceholder).toBe('concept');
  });

  it('submits the body with the supplied values substituted', () => {
    const onSubmit = vi.fn();
    const handle = openTemplateFill({
      text: '围绕 {{concept}} 写',
      anchor: anchor(),
      theme: 'dark',
      labels,
      onSubmit,
    });

    handle.slots[0].textContent = '沉没成本';
    (document.querySelector('.gv-pm-fill .gv-pm-save') as HTMLButtonElement).click();

    expect(onSubmit).toHaveBeenCalledWith('围绕 沉没成本 写');
    expect(document.querySelector('.gv-pm-fill')).toBeNull();
  });

  it('keeps a blank slot literal instead of sending an empty hole', () => {
    const onSubmit = vi.fn();
    const handle = openTemplateFill({
      text: '围绕 {{concept}} 用 {{tone}} 的语气',
      anchor: anchor(),
      theme: 'dark',
      labels,
      onSubmit,
    });

    handle.slots[0].textContent = '沉没成本';
    (document.querySelector('.gv-pm-fill .gv-pm-save') as HTMLButtonElement).click();

    expect(onSubmit).toHaveBeenCalledWith('围绕 沉没成本 用 {{tone}} 的语气');
  });

  it('mirrors a value into every slot that repeats its name', () => {
    const handle = openTemplateFill({
      text: '把 {{topic}} 讲给 {{topic}} 听',
      anchor: anchor(),
      theme: 'dark',
      labels,
      onSubmit: vi.fn(),
    });

    handle.slots[0].textContent = '一个 AI 的可解释性研究方向';
    handle.slots[0].dispatchEvent(new Event('input', { bubbles: true }));

    expect(handle.slots[1].textContent).toBe('一个 AI 的可解释性研究方向');
    handle.close();
  });

  it('lets a slot wrap instead of growing past the card that holds it', () => {
    // An `<input>` cannot wrap. Measured on gemini.google.com, a 45-character
    // value made a 465px slot inside a 460px card, which then scrolled
    // sideways and clipped its own text.
    const handle = openTemplateFill({
      text: '把 {{topic}} 讲清楚',
      anchor: anchor(),
      theme: 'dark',
      labels,
      onSubmit: vi.fn(),
    });

    const slot = handle.slots[0];
    expect(slot.tagName).toBe('SPAN');
    expect(slot.getAttribute('contenteditable')).toBe('true');
    // Nothing sets a width, so the slot can only ever be as wide as the line
    // it sits on allows.
    expect(slot.style.width).toBe('');
    handle.close();
  });

  it('treats a repeated variable as one question', () => {
    const onSubmit = vi.fn();
    const handle = openTemplateFill({
      text: '{{x}} 与 {{x}}',
      anchor: anchor(),
      theme: 'dark',
      labels,
      onSubmit,
    });

    handle.slots[0].textContent = '甲';
    handle.slots[0].dispatchEvent(new Event('input', { bubbles: true }));

    expect(handle.slots[1].textContent).toBe('甲');
    (document.querySelector('.gv-pm-fill .gv-pm-save') as HTMLButtonElement).click();
    expect(onSubmit).toHaveBeenCalledWith('甲 与 甲');
  });

  it('offers an escape that inserts the body untouched', () => {
    const onSubmit = vi.fn();
    openTemplateFill({
      text: '围绕 {{concept}} 写',
      anchor: anchor(),
      theme: 'dark',
      labels,
      onSubmit,
    });

    (document.querySelector('.gv-pm-fill .gv-pm-cancel') as HTMLButtonElement).click();
    expect(onSubmit).toHaveBeenCalledWith('围绕 {{concept}} 写');
  });

  it('commits on Enter and abandons on Escape', () => {
    const submitted = vi.fn();
    const cancelled = vi.fn();
    const handle = openTemplateFill({
      text: '围绕 {{concept}} 写',
      anchor: anchor(),
      theme: 'dark',
      labels,
      onSubmit: submitted,
      onCancel: cancelled,
    });

    handle.slots[0].textContent = '沉没成本';
    handle.slots[0].dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }),
    );
    expect(submitted).toHaveBeenCalledWith('围绕 沉没成本 写');

    const second = openTemplateFill({
      text: '围绕 {{concept}} 写',
      anchor: anchor(),
      theme: 'dark',
      labels,
      onSubmit: submitted,
      onCancel: cancelled,
    });
    second.slots[0].dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }),
    );
    expect(cancelled).toHaveBeenCalledTimes(1);
    expect(document.querySelector('.gv-pm-fill')).toBeNull();
  });

  it('unbinds its window listeners once closed', () => {
    const cancelled = vi.fn();
    const handle = openTemplateFill({
      text: '{{a}}',
      anchor: anchor(),
      theme: 'dark',
      labels,
      onSubmit: vi.fn(),
      onCancel: cancelled,
    });

    handle.close();
    handle.close(); // idempotent

    // A stray outside click after teardown must not reach the closed surface.
    window.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(cancelled).not.toHaveBeenCalled();
  });
});

describe('highlightTemplateVariables', () => {
  it('turns placeholders in rendered markup into chips', () => {
    const root = document.createElement('div');
    root.innerHTML = '<p>围绕 {{concept}} 用 {{tone}} 的语气</p>';
    highlightTemplateVariables(root);

    const chips = [...root.querySelectorAll('.gv-pm-var')].map((el) => el.textContent);
    expect(chips).toEqual(['concept', 'tone']);
    // The surrounding prose survives intact.
    expect(root.textContent).toBe('围绕 concept 用 tone 的语气');
  });

  it('leaves a body with no placeholders untouched', () => {
    const root = document.createElement('div');
    root.innerHTML = '<p>把这篇论文讲清楚</p>';
    const before = root.innerHTML;
    highlightTemplateVariables(root);
    expect(root.innerHTML).toBe(before);
  });

  it('does not reinterpret the markup around the text', () => {
    const root = document.createElement('div');
    root.innerHTML = '<p><strong>标题</strong> {{concept}}</p>';
    highlightTemplateVariables(root);
    expect(root.querySelector('strong')?.textContent).toBe('标题');
    expect(root.querySelectorAll('.gv-pm-var').length).toBe(1);
  });
});

describe('template fill keystroke containment', () => {
  it('ignores the Enter an IME uses to accept its candidate', () => {
    // Typing a CJK value into a slot ends with an Enter that belongs to the
    // input method, not to us. Committing there submits a half-typed word.
    const submitted = vi.fn();
    const handle = openTemplateFill({
      text: '围绕 {{concept}} 写',
      anchor: anchor(),
      theme: 'dark',
      labels,
      onSubmit: submitted,
    });

    handle.slots[0].textContent = '沉没';
    handle.slots[0].dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'Enter',
        bubbles: true,
        cancelable: true,
        isComposing: true,
      }),
    );

    expect(submitted).not.toHaveBeenCalled();

    // The Enter that follows the composition does commit.
    handle.slots[0].textContent = '沉没成本';
    handle.slots[0].dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }),
    );
    expect(submitted).toHaveBeenCalledWith('围绕 沉没成本 写');
  });

  it('swallows the rest of the keystroke that committed it', () => {
    // The composer takes focus inside `onSubmit`, so the keyup of this very
    // keystroke would otherwise land there and send the message.
    const composer = vi.fn();
    const handle = openTemplateFill({
      text: '围绕 {{concept}} 写',
      anchor: anchor(),
      theme: 'dark',
      labels,
      onSubmit: () => {},
    });

    document.addEventListener('keyup', composer);
    handle.slots[0].textContent = '沉没成本';
    handle.slots[0].dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }),
    );
    document.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', bubbles: true }));

    expect(composer).not.toHaveBeenCalled();

    // An unrelated key is not affected.
    document.dispatchEvent(new KeyboardEvent('keyup', { key: 'a', bubbles: true }));
    expect(composer).toHaveBeenCalledTimes(1);
    document.removeEventListener('keyup', composer);
  });
});
