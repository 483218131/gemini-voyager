/**
 * Keeps a sent prompt looking like the token it was chosen as.
 *
 * `expandTokensForSend` replaces the composer token with the full body before
 * submit, so Gemini stores and re-renders the expanded text. This collapses the
 * rendered user turn back to the prompt's name, with a click to reveal what was
 * actually sent.
 *
 * Purely additive to Gemini's DOM: a class on the bubble and one inserted chip,
 * both removed on teardown. Nothing Gemini owns is moved or deleted, because
 * the bubble is re-rendered on navigation and its structure changes without
 * notice.
 */

import {
  type PromptIdentity,
  type SentPromptMatch,
  compilePrompts,
  matchCompiledPrompt,
} from '@/features/prompt/model/promptTextMatch';
import { getTranslationSync } from '@/utils/i18n';

const COLLAPSED_CLASS = 'gv-pm-sent-collapsed';
const CHIP_CLASS = 'gv-pm-sent-chip';
const MARKED_ATTR = 'data-gv-pm-sent';
const LINE_CLASS = 'gv-pm-sent-line';
const REST_CLASS = 'gv-pm-sent-rest';
/**
 * Gemini's own show-more control for a long turn. While this feature is
 * collapsed it governs content that is already hidden, so leaving it visible
 * offers a second, conflicting toggle over the same text.
 */
const GEMINI_TOGGLE_SELECTOR = '.luminous-toggle-container';
/** Gemini's own expand button, inside that container. */
const GEMINI_EXPAND_SELECTOR =
  '[data-test-id="luminous-expand-button"], .luminous-toggle-container button';
/** The class Gemini puts on the text block while it is clamping it. */
const GEMINI_CLAMP_SELECTOR = '.query-text.collapsed';
const TOGGLE_HIDDEN_CLASS = 'gv-pm-sent-toggle-hidden';

/**
 * Where Gemini keeps the message text itself, in preference order. Reading the
 * bubble wholesale instead picks up its copy, edit and expand controls, and
 * those render through a Material Symbols icon font whose glyph *is* the
 * element's text - so `textContent` gains literal words like `content_copy`
 * and no anchored pattern can ever match. `DOMContentExtractor` reads user
 * turns through the same selector.
 */
const TEXT_SELECTORS = ['.query-text-line', '.query-text'];

/** Ordered by how specific each one is; the first that resolves wins. */
const BUBBLE_SELECTORS = [
  '.user-query-bubble-with-background',
  '.user-query-bubble-container',
  '.user-query-container',
];

export interface SentPromptChipsOptions {
  /** Saved prompts to recognise. Replaced wholesale by `setPrompts`. */
  prompts: PromptIdentity[];
  root?: ParentNode;
}

export interface SentPromptChipsController {
  setPrompts: (prompts: PromptIdentity[]) => void;
  /** Re-scan now. Called by the observer; exposed for tests and navigation. */
  refresh: () => void;
  destroy: () => void;
}

function detectTheme(): 'light' | 'dark' {
  if (
    document.querySelector('.theme-host.dark-theme') ||
    document.body.classList.contains('dark-theme') ||
    document.documentElement.classList.contains('dark') ||
    document.body.getAttribute('data-theme') === 'dark'
  ) {
    return 'dark';
  }
  return 'light';
}

/**
 * The first selector that resolves wins, as elsewhere in this codebase. An
 * earlier version kept whichever match contained no other match, to land on the
 * innermost bubble - but Gemini nests these containers in an order this code
 * does not control, and one unexpected descendant made every candidate look
 * like an outer wrapper and skipped them all. Trying the selectors in order of
 * how tightly they wrap the text is the same intent without that failure mode.
 */
function bubblesIn(root: ParentNode): HTMLElement[] {
  for (const selector of BUBBLE_SELECTORS) {
    const found = [...root.querySelectorAll<HTMLElement>(selector)];
    if (found.length > 0) return found;
  }
  return [];
}

/**
 * The message as its rendered lines, without the controls Gemini draws beside
 * them and without this feature's own chip. Lines rather than one string
 * because the match reports where the prompt ends, and the split has to land
 * on a line boundary.
 */
function messageLinesOf(bubble: HTMLElement): { lines: string[]; elements: HTMLElement[] } {
  for (const selector of TEXT_SELECTORS) {
    const found = [...bubble.querySelectorAll<HTMLElement>(selector)];
    if (found.length > 0) {
      return { lines: found.map((line) => line.textContent ?? ''), elements: found };
    }
  }
  // A layout this code has not seen. Strip the controls on a copy rather than
  // trusting the bubble's raw text; the live DOM is never touched. With no
  // line elements to hide, such a turn is matched but never collapsed.
  const copy = bubble.cloneNode(true) as HTMLElement;
  copy.querySelectorAll(`button, [role="button"], mat-icon, .${CHIP_CLASS}`).forEach((node) => {
    node.remove();
  });
  return { lines: [copy.textContent ?? ''], elements: [] };
}

export function startSentPromptChips(options: SentPromptChipsOptions): SentPromptChipsController {
  const root = options.root ?? document;
  let compiled = compilePrompts(options.prompts);
  let destroyed = false;

  /**
   * Chip to the bubble it belongs to. The chip is inserted beside the line it
   * stands in for, not as a child of the bubble, so its parent is no longer a
   * reliable way back to the element carrying the collapsed state.
   */
  const chips = new Map<HTMLElement, { bubble: HTMLElement; restore: () => void }>();

  /**
   * Turns the reader has opened, keyed by their own text.
   *
   * Pressing Gemini's expand button makes it re-render the whole turn: measured
   * here, the bubble this code was holding went to zero height mid-click while
   * Angular swapped the nodes. The chip and its classes go with them, the
   * observer then sees a fresh matching turn and collapses it again - the
   * grow-then-shrink flicker, arriving from the one direction that survives not
   * fighting Gemini for its clamp. An element reference cannot outlive that, so
   * the state hangs off the message instead.
   */
  const opened = new Set<string>();

  function releaseBubble(bubble: HTMLElement): void {
    bubble.classList.remove(COLLAPSED_CLASS);
    bubble.removeAttribute(MARKED_ATTR);
    bubble.removeAttribute('data-gv-theme');
    bubble.querySelectorAll(`.${LINE_CLASS}`).forEach((line) => line.classList.remove(LINE_CLASS));
    bubble.querySelectorAll(`.${REST_CLASS}`).forEach((node) => node.remove());
    bubble
      .querySelectorAll(`.${TOGGLE_HIDDEN_CLASS}`)
      .forEach((node) => node.classList.remove(TOGGLE_HIDDEN_CLASS));
  }

  function buildChip(name: string): HTMLElement {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = CHIP_CLASS;
    chip.textContent = name;
    chip.title = getTranslationSync('pm_sent_chip_hint');
    chip.setAttribute('aria-label', name);
    chip.setAttribute('aria-expanded', 'false');
    return chip;
  }

  function collapse(
    bubble: HTMLElement,
    match: SentPromptMatch,
    lineEls: HTMLElement[],
    key: string,
  ): void {
    // Every line the prompt reaches into. The last of them may also hold the
    // person's own words, which come back below as our own element rather than
    // by editing Gemini's text - the bubble is re-rendered on navigation and
    // nothing it owns is safe to rewrite.
    const owned = lineEls.slice(0, match.lineCount);
    const chip = buildChip(match.name);

    let rest: HTMLElement | null = null;
    if (match.remainder.trim()) {
      rest = document.createElement('span');
      rest.className = REST_CLASS;
      rest.textContent = match.remainder.trimEnd();
    }

    // Gemini's own clamp is deliberately left alone. Removing it on expand
    // looked right for a frame and then fought back: Gemini owns that state and
    // re-applies it, which is the grow-then-shrink flicker. Expanding here means
    // getting out of the way - the turn returns to exactly how Gemini would
    // present it, with this chip as the way back.
    const toggle = bubble.querySelector<HTMLElement>(GEMINI_TOGGLE_SELECTOR);

    const setCollapsed = (collapsed: boolean): void => {
      bubble.classList.toggle(COLLAPSED_CLASS, collapsed);
      for (const line of owned) line.classList.toggle(LINE_CLASS, collapsed);
      if (rest) rest.hidden = !collapsed;
      toggle?.classList.toggle(TOGGLE_HIDDEN_CLASS, collapsed);
      chip.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
      // Revealing the lines is not enough on a long turn: Gemini still clamps
      // them to a couple of visible rows. Press its own button rather than
      // stripping the class, so the transition runs through Gemini's state
      // machine instead of against it.
      if (!collapsed && bubble.querySelector(GEMINI_CLAMP_SELECTOR)) {
        bubble.querySelector<HTMLElement>(GEMINI_EXPAND_SELECTOR)?.click();
      }
    };

    chip.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      const collapsed = !bubble.classList.contains(COLLAPSED_CLASS);
      if (collapsed) opened.delete(key);
      else opened.add(key);
      setCollapsed(collapsed);
    });

    bubble.setAttribute(MARKED_ATTR, match.name);
    bubble.setAttribute('data-gv-theme', detectTheme());
    // In front of the first line it stands in for, so the chip reads as
    // replacing that text rather than as a separate header.
    const anchor = owned[0] ?? lineEls[0];
    if (anchor) anchor.before(chip);
    else bubble.prepend(chip);
    if (rest) chip.after(rest);
    // A re-render lands here again for a turn the reader had already opened.
    setCollapsed(!opened.has(key));
    chips.set(chip, {
      bubble,
      restore: () => toggle?.classList.remove(TOGGLE_HIDDEN_CLASS),
    });
  }

  function refresh(): void {
    if (destroyed) return;
    for (const bubble of bubblesIn(root)) {
      const already = bubble.getAttribute(MARKED_ATTR);
      const chip = bubble.querySelector<HTMLElement>(`.${CHIP_CLASS}`);
      const { lines, elements } = messageLinesOf(bubble);
      const match = elements.length > 0 ? matchCompiledPrompt(lines, compiled) : null;
      const key = lines.join('\n');

      if (!match) {
        if (chip) {
          chips.get(chip)?.restore();
          chip.remove();
          chips.delete(chip);
          releaseBubble(bubble);
        }
        continue;
      }
      if (already === match.name) continue;

      // The prompt list changed under a bubble that is already collapsed.
      if (chip) {
        chips.get(chip)?.restore();
        chip.remove();
        chips.delete(chip);
        releaseBubble(bubble);
      }
      collapse(bubble, match, elements, key);
    }
  }

  // Gemini streams a reply into the same subtree, so the observer fires
  // constantly while one is being written. Coalesce into one pass.
  let scheduled: number | null = null;
  const observer = new MutationObserver(() => {
    if (scheduled !== null) return;
    scheduled = window.setTimeout(() => {
      scheduled = null;
      refresh();
    }, 120);
  });

  observer.observe(document.body, { childList: true, subtree: true });
  refresh();

  return {
    setPrompts: (prompts: PromptIdentity[]) => {
      compiled = compilePrompts(prompts);
      refresh();
    },
    refresh,
    destroy: () => {
      if (destroyed) return;
      destroyed = true;
      observer.disconnect();
      if (scheduled !== null) window.clearTimeout(scheduled);
      scheduled = null;
      for (const [chip, owner] of chips) {
        chip.remove();
        owner.restore();
        releaseBubble(owner.bubble);
      }
      chips.clear();
    },
  };
}
