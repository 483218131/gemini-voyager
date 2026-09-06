/**
 * Recognising a sent message as one of the user's saved prompts.
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
   * How many leading lines the prompt reaches into. A slash token can be
   * followed by the user's own words - that is the point of inserting one into
   * a composer you can still type in - so anything past the prompt belongs to
   * the person, not the template, and must stay readable.
   */
  lineCount: number;
  /**
   * The person's own text from the final covered line, when they carried on
   * writing without starting a new one. Measured on gemini.google.com: a
   * 749-character prompt followed by two more characters on the same line, no
   * newline between them, which is what typing after the token produces.
   */
  remainder: string;
}

/**
 * A template needs this many literal non-whitespace characters before it is
 * allowed to claim a message. Without it, a body that is little more than a
 * placeholder — `{{x}}`, or `# {{title}}` — compiles to a near-universal
 * pattern and would label unrelated messages. An exact prompt carries no
 * wildcard and needs no such floor.
 */
const MIN_TEMPLATE_LITERAL = 4;

/**
 * Whitespace is removed outright, not flattened to a single space.
 *
 * Gemini re-renders a sent message as block markup and `textContent` joins the
 * blocks with nothing between them, so a body authored as
 * `heading\n\nparagraph` comes back as `headingparagraph`. Collapsing to a
 * space instead would leave one on the prompt's side and none on the message's,
 * and no multi-line prompt would ever match. The composer's own token spacer
 * and any trailing newline disappear here too.
 *
 * The cost is that two messages differing only in spacing compare equal. For
 * deciding "is this that saved prompt" they are the same message, and the
 * literal floor below keeps a thin template from exploiting the looser
 * comparison.
 */
export function normalizeSentText(value: string): string {
  return value.replace(/\s+/g, '');
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

interface CompiledPrompt {
  id: string;
  name: string;
  specificity: number;
  /** Absent for a prompt with no placeholders, which is compared literally. */
  pattern: RegExp | null;
  /** The same pattern without its end anchor: "the message opens with this". */
  opensWith: RegExp | null;
  exact: string;
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

  if (!hasVariable) {
    const exact = normalizeSentText(prompt.text);
    if (!exact) return null;
    return { id: prompt.id, name, specificity, pattern: null, opensWith: null, exact };
  }

  if (specificity < MIN_TEMPLATE_LITERAL) return null;

  const source = segments
    .map((segment) =>
      segment.kind === 'text'
        ? escapeRegExp(normalizeSentText(segment.value))
        : // A filled value, or the literal `{{name}}` that `fillPromptTemplate`
          // leaves behind when the user sends a blank one. Both are just
          // characters here, so one branch covers them.
          '[\\s\\S]+?',
    )
    .join('');

  return {
    id: prompt.id,
    name,
    specificity,
    pattern: new RegExp(`^${source}$`),
    opensWith: new RegExp(`^${source}`),
    exact: '',
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
 * Normalized characters of `value`, and the raw suffix holding the last `count`
 * of them. Used to hand back the person's own words with their original
 * spacing after the prompt's extent has been measured on normalized text.
 */
function trailingRaw(value: string, count: number): string {
  if (count <= 0) return '';
  let seen = 0;
  for (let index = value.length - 1; index >= 0; index--) {
    if (!/\s/.test(value[index])) seen++;
    if (seen === count) return value.slice(index);
  }
  return value;
}

/**
 * The saved prompt a sent message came from, or `null`.
 *
 * Takes the message as its rendered lines rather than one string, because a
 * match has to report where the prompt *ends*. Inserting a slash token leaves
 * the composer editable, and carrying on writing after it is ordinary use -
 * collapsing the whole turn would then hide the sentence the person actually
 * wrote, which is the part worth reading. Prompts are tried most-specific
 * first, so the first hit is already the best explanation.
 */
export function matchCompiledPrompt(
  lines: string[],
  compiled: CompiledPrompt[],
): SentPromptMatch | null {
  const whole = normalizeSentText(lines.join(''));
  if (!whole) return null;

  for (const candidate of compiled) {
    // How much of the message the prompt accounts for, in normalized
    // characters. The pattern's wildcards are lazy, so the match stops at the
    // prompt's own end rather than reaching into what follows.
    let covered = 0;
    if (candidate.pattern) {
      const hit = candidate.opensWith?.exec(whole);
      if (!hit) continue;
      covered = hit[0].length;
    } else {
      if (!whole.startsWith(candidate.exact)) continue;
      covered = candidate.exact.length;
    }

    // Walk the rendered lines until the prompt is used up. The boundary may
    // fall inside a line, which is the common case: typing after the token
    // adds to that line rather than starting a new one.
    let consumed = 0;
    for (let index = 0; index < lines.length; index++) {
      const lineLength = normalizeSentText(lines[index]).length;
      if (consumed + lineLength < covered) {
        consumed += lineLength;
        continue;
      }
      return {
        id: candidate.id,
        name: candidate.name,
        specificity: candidate.specificity,
        lineCount: index + 1,
        remainder: trailingRaw(lines[index], consumed + lineLength - covered),
      };
    }
  }
  return null;
}

/** Convenience for a one-off match; compile once when matching many turns. */
export function matchSentPrompt(
  lines: string[] | string,
  prompts: PromptIdentity[],
): SentPromptMatch | null {
  return matchCompiledPrompt(
    Array.isArray(lines) ? lines : lines.split('\n'),
    compilePrompts(prompts),
  );
}
