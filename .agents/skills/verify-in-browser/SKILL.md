---
name: verify-in-browser
description: Verify a content-script or injected-CSS change against a live Gemini/Claude/ChatGPT tab instead of reasoning about it. Covers reloading the unpacked extension, reading the real DOM, and the Gemini shapes that make static reasoning wrong. Use for “在浏览器里验证”, “reload the extension”, “为什么没生效”, “live check”, or any content-script fix that cannot be settled by tests alone.
metadata:
  version: '1.0.0'
---

# Verify a content-script change in a live browser

Content modules bridge Voyager to a DOM nobody here controls. Unit tests pin
the logic against a fixture _we wrote_, so they confirm the code does what the
fixture says — not that the fixture matches the page. Every hour lost on these
modules has the same shape: a plausible fix shipped from reading code, and the
real cause found later in one DOM dump.

**Read the page before proposing a second fix.** If the first attempt did not
work, stop editing and go get the DOM.

## Reloading the extension

`dist_chrome` is rewritten by `bun run build:chrome`, and Chrome keeps serving
the old copy until the unpacked extension is reloaded. A "fix that did not
work" is very often an unreloaded build.

The `chrome-devtools` MCP server can do it without leaving the session:

```
list_extensions        # find the Voyager id
reload_extension       # pass that id
```

It is **not** part of this repository, on purpose. It attaches to whatever
Chrome is already running, with that person's real session, and it launches an
unpinned `@latest` package — a per-developer trust decision, not a repo default.
Add it at user scope if you want it:

```bash
claude mcp add --scope user chrome-devtools -- \
  npx -y chrome-devtools-mcp@latest --autoConnect --no-usage-statistics --categoryExtensions=true
```

Without that server, `chrome://` pages are unreachable from browser automation:
ask the user to reload from `chrome://extensions` and to hard-refresh the tab.
Say which build they need and why, rather than asking them to "try again".

**Close the loop yourself.** Reloading the extension is not enough — an open tab
keeps running the content script it loaded at navigation, so the person looking
at it still sees the old build. After every fix, run the whole sequence before
saying anything:

```text
bun run build:chrome        # or build:all when public/ entries changed
reload_extension            # the Voyager id from list_extensions
navigate_page  type=reload  ignoreCache=true   # every tab on the affected site
```

Then read the page and report what you measured. Handing back "reload and try
again" spends a round trip on something you can do, and the reply that comes
back is usually a screenshot of the build you already replaced.

## Reading the page

`claude-in-chrome` drives any normal page. Confirm the build under test is the
one loaded before drawing conclusions from what you see — probe a class the new
build introduces:

```js
const p = document.createElement('div');
p.className = 'gv-pm-sent-chip'; // a class only the new build styles
document.body.appendChild(p);
const loaded = getComputedStyle(p).borderRadius === '8px';
p.remove();
```

When a match or a selector fails, dump the ground truth and diff it against
what the code assumed — the divergence index, not a summary:

```js
let i = 0;
while (i < expected.length && i < actual.length && expected[i] === actual[i]) i++;
({ i, expected: expected.slice(i - 30, i + 30), actual: actual.slice(i - 30, i + 30) });
```

## Gemini shapes that make static reasoning wrong

Each of these cost a wrong fix before it was measured. Full entries live in
[folders-timeline-ui.md](../../../.github/docs/regressions/folders-timeline-ui.md).

- A user turn's `textContent` is **not** the message. The bubble also carries a
  screen-reader "You said" prefix and the copy/edit/expand controls, which render
  through a Material Symbols icon font whose glyph _is_ the element's text — so
  the string gains literal words like `content_copy`. Read `.query-text-line`.
- A long turn is **collapsed, not truncated**: all 62 lines sit in the DOM
  behind a CSS height clamp and an expand chevron. Do not design around
  recovering text that is already there.
- Text typed after a slash token lands on the prompt's **own last line**, with no
  newline between them. Anything that assumes a line boundary between the
  template and the person's words never fires.

## Before you finish

- State what you verified in the browser and what you only inferred. If the
  extension could not be reloaded, the check did not happen — say so.
- Turn each measured surprise into a Trap/Rule/Guard entry, then run
  `bun run regressions:check`.
- Close any tab this session created.
