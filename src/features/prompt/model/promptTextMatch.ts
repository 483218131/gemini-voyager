/**
 * Recognising a sent message as one of the user's saved prompts, and saying
 * which parts of it were filled in.
 *
 * The slash token in the composer is only a shell: `expandTokensForSend`
 * replaces it with the full body before submit, so Gemini stores and re-renders
 * the expanded text. Nothing is written down at send time, and nothing needs to
 * be — the saved prompts are already on this machine, so the sent text can be
 * matched back against them. That keeps this a rendering concern: it survives a
 * reload, and it works for the first message of a brand new conversation, where
 * there is no conversation id to key a record on yet.
 *
 * Pure string operations only — no DOM, no storage.
 */

import { parsePromptTemplate } from './promptTemplate';

/** A saved prompt reduced to what identifying a sent message needs. */
export interface PromptIdentity {
  id: string;
  name: string;
  text: string;
}

/** Half-open `[start, end)` offsets into the message the match was run on. */
export type TextRange = readonly [number, number];

export interface SentPromptMatch {
  id: string;
  name: string;
  /**
   * Literal, non-whitespace characters the prompt itself contributed. Used to
   * choose between prompts that both match: the one that pinned down more of
   * the message is the better explanation of it.
   */
  specificity: number;
  /**
   * Where the prompt's own text stops. A slash token leaves the composer
   * editable and carrying on writing after it is ordinary use, so everything
   * from here on belongs to the person, not the template. Measured on
   * gemini.google.com: a prompt ending at 749 characters with `大大` typed onto
   * its own final line, no newline between them.
   */
  end: number;
  /**
   * What was typed into each placeholder, in source order. Marked in the
   * rendered prompt so a reader can tell their own answer apart from the
   * template around it — without it, a filled template reads as one
   * undifferentiated wall.
   */
  values: TextRange[];
}

/**
 * A template needs this many literal non-whitespace characters before it is
 * allowed to claim a message. Without it, a body that is little more than a
 * placeholder — `{{x}}`, or `# {{title}}` — compiles to a near-universal
 * pattern and would label unrelated messages. An exact prompt carries no
 * wildcard and needs no such floor.
 */
const MIN_TEMPLATE_LITERAL = 4;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * A literal run of the prompt, made tolerant of how the message was re-rendered.
 *
 * Gemini lays a turn out as block markup, and reading it back through
 * `.query-text-line` joins the blocks with a single newline whatever the body
 * was authored with — a blank line between paragraphs, a soft-wrapped
 * continuation indented by two spaces, the composer's own token spacer. Every
 * run of whitespace on either side therefore becomes "any whitespace, or none".
 */
function literalPattern(value: string): string {
  return value.split(/\s+/).map(escapeRegExp).join('\\s*');
}

interface CompiledPrompt {
  id: string;
  name: string;
  specificity: number;
  /**
   * Anchored at the start only, with *every* segment captured — the literal
   * runs as well as the placeholders. Group lengths then add up to each
   * placeholder's offset, which is how the fill positions are recovered
   * without RegExp `d` flag: Safari gained match indices in 16.4 and this
   * extension supports 15.4, the same floor that already rules out lookbehind.
   */
  pattern: RegExp;
  /** Which capture groups, by index from 1, are placeholders. */
  valueGroups: Set<number>;
}

function compile(prompt: PromptIdentity): CompiledPrompt | null {
  const name = prompt.name?.trim();
  // Nothing to show in a chip, so nothing to collapse to.
  if (!name || !prompt.text) return null;

  const segments = parsePromptTemplate(prompt.text);
  const literal = segments
    .filter((segment) => segment.kind === 'text')
    .map((segment) => segment.value)
    .join('');
  const specificity = literal.replace(/\s+/g, '').length;
  const hasVariable = segments.some((segment) => segment.kind === 'variable');
  if (hasVariable && specificity < MIN_TEMPLATE_LITERAL) return null;
  if (!hasVariable && specificity === 0) return null;

  const valueGroups = new Set<number>();
  // Group 1 is the leading whitespace below; segment groups start after it.
  let group = 1;
  const source = segments
    .map((segment) => {
      group += 1;
      if (segment.kind === 'text') return `(${literalPattern(segment.value)})`;
      valueGroups.add(group);
      // A filled value, or the literal `{{name}}` that `fillPromptTemplate`
      // leaves behind when the user sends a blank one. Both are just
      // characters here, so one branch covers them.
      return '([\\s\\S]*?)';
    })
    .join('');

  // The leading `(\s*)` absorbs the padding a rendered line carries - read off
  // gemini.google.com, the first comes back as `" # 寓言写作 Prompt "`, and
  // anchoring hard against the prompt's first character missed every turn. It is
  // a capture group like every other part, so its length counts toward the
  // offsets the fill positions are summed from.
  return {
    id: prompt.id,
    name,
    specificity,
    pattern: new RegExp(`^(\\s*)${source}`),
    valueGroups,
  };
}

/**
 * Compile the saved prompts once, so a list of turns can be matched without
 * rebuilding every pattern per turn.
 */
export function compilePrompts(prompts: PromptIdentity[]): CompiledPrompt[] {
  return prompts
    .map(compile)
    .filter((compiled): compiled is CompiledPrompt => compiled !== null)
    .sort((left, right) => right.specificity - left.specificity);
}

/**
 * The saved prompt a message came from, or `null`. Prompts are tried
 * most-specific first, so the first hit is already the best explanation.
 */
export function matchCompiledPrompt(
  message: string,
  compiled: CompiledPrompt[],
): SentPromptMatch | null {
  if (!message.trim()) return null;

  for (const candidate of compiled) {
    const hit = candidate.pattern.exec(message);
    if (!hit) continue;

    const values: TextRange[] = [];
    let offset = 0;
    for (let group = 1; group < hit.length; group++) {
      const captured = hit[group] ?? '';
      if (candidate.valueGroups.has(group) && captured.length > 0) {
        values.push([offset, offset + captured.length]);
      }
      offset += captured.length;
    }

    return {
      id: candidate.id,
      name: candidate.name,
      specificity: candidate.specificity,
      end: hit[0].length,
      values,
    };
  }
  return null;
}

/** Convenience for a one-off match; compile once when matching many turns. */
export function matchSentPrompt(
  message: string,
  prompts: PromptIdentity[],
): SentPromptMatch | null {
  return matchCompiledPrompt(message, compilePrompts(prompts));
}
