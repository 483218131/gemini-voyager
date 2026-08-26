# Gemini controls regression notes

Read this file when changing Gemini scrolling, model or thinking controls, usage parsing, or
generation traffic detection.

## Prevent auto scroll swallowed `scrollIntoView` layout side effects

- **Trap:** With prevent-auto-scroll enabled, sending a Gemini message could make the sidebar/folder
  area render far too wide. Collapsing and reopening the sidebar restored the layout. The page
  script returned early from Gemini's native `scrollIntoView`. That blocked the downward chat jump,
  but it also swallowed Gemini's own layout side effects for the sidebar.
- **Rule:** Let the native `scrollIntoView` run, then restore protected vertical scroll positions
  for the chat/viewport.
- **Guard:** `src/pages/content/preventAutoScroll/__tests__/preventAutoScrollScript.test.ts`

## Gemini table menus are not model menus

- **Trap:** Gemini table option menus showed Voyager default-model star buttons, including the "Set
  as default model" tooltip. The default model injector treated generic Gemini menu DOM such as
  `.label-container` as enough evidence that a popup was a model menu. Gemini table menus use
  similar menu structure.
- **Rule:** Require model-menu evidence such as `data-mode-id`, `.mode-title`, or
  `.title-and-description` before injecting star buttons.
- **Guard:** `src/pages/content/defaultModel/__tests__/modelLocker.test.ts`

## Default model auto-apply must yield to active composer input

- **Trap:** Typing in a fresh Gemini chat could lose focus while the page was still loading.
  Disabling default-model auto-apply made the problem disappear. The default-model lock loop opened
  Gemini's model picker after startup even when the user had already started typing in the composer.
  The follow-up refocus helped after the switch, but the menu click still stole focus first.
- **Rule:** Track composer input/keydown activity and skip the current auto-apply attempt once the
  user has started editing the chat input.
- **Guard:** `src/pages/content/defaultModel/__tests__/modelLocker.test.ts`

## Thinking-level default must resolve by label, not per-row OR

- **Trap:** Both Standard and Extended showed a filled default star at once in the Thinking level
  submenu, selecting two "defaults" simultaneously. `isThinkingDefaultForItem` marked a row default
  when EITHER its label matched the stored label OR its position matched the stored index. When the
  stored `{index, label}` pair drifted apart (e.g. saved under a different submenu order/language),
  the label lit one row and the stale index lit another, so two stars turned gold. The stored index
  and label are separate keys and can disagree; an OR test over each row cannot stay single-valued.
- **Rule:** Resolve exactly one default row per render (`resolveThinkingDefaultIndex`): prefer the
  label match, fall back to the stored index only when no label matches and it addresses a real row.
  The star click now reads its own `is-default` class instead of re-deriving from `(index, label)`.
- **Guard:** `src/pages/content/defaultModel/__tests__/modelLocker.test.ts` ("marks only one
  thinking level default when the stored index and label disagree")

## Auto-applied thinking level must close the picker it opened

- **Trap:** After auto-selection ran, the Thinking level row was unresponsive until the whole model
  picker was manually closed and reopened. `tryLockToThinkingLevel` opened the picker and
  thinking-level submenu, clicked the target, then refocused the composer without closing the menu.
  The half-open picker left a submenu overlay that the user's next open could not drive.
- **Rule:** Close the menu (`document.body.click()`) right after the auto-switch click, mirroring
  the already-selected branch so the next manual open starts clean.
- **Guard:** `src/pages/content/defaultModel/__tests__/modelLocker.test.ts`

## Never lock to the page-default Standard thinking level

- **Trap:** On an already-correct new chat, the model picker could flash open during load. The lock
  loop opened the picker to enforce Standard even though Standard is Gemini's built-in default. That
  work is a no-op; a default corrupted by the double-star bug made it worse.
- **Rule:** Treat a Standard target (index 0 / label "standard") as "no thinking preference" for
  enforcement (`isPageDefaultThinkingLevel`), keeping the raw value only for the star display. Also
  bail before starting the loop when the trigger pill already shows the starred model + thinking
  level.
- **Guard:** `src/pages/content/defaultModel/__tests__/modelLocker.test.ts` ("never enforces the
  page-default Standard thinking level")

## tryLockToModel must reuse the bidirectional pill match

- **Trap:** On load, the model picker could flash and leave a focus ring even when Pro and Standard
  were already selected. `tryLockToModel` used a forward-only whole-word test, asking whether stored
  "3.1 pro" appeared in pill label "pro". A timing window could therefore open and close the picker
  for an already-selected model; Angular CDK then restored focus to the trigger.
- **Rule:** Early-return using the same `modelMatchesLines` (bidirectional short/long) check as the
  fast-path, and bail without opening the menu when the pill is not readable yet (retry next tick).
- **Guard:** `src/pages/content/defaultModel/__tests__/modelLocker.test.ts` ("does not open the
  picker while the trigger pill is still empty")

## Gemini native copy traffic is not generation traffic

- **Trap:** Clicking Gemini's native copy response button could make the page feel stuck or trigger
  generation-related observers. The observers looked at `batchexecute` request bodies and could
  match generation-looking text inside copy-related traffic. Both `fetch` and XHR paths needed the
  same guard.
- **Rule:** Ignore copy/non-generation `batchexecute` requests before treating traffic as generation
  completion or usage refresh evidence.
- **Guard:** `src/pages/content/responseNotification/__tests__/pageObserver.test.ts`
  `src/pages/content/usageStatus/__tests__/usageObserver.test.ts`

## Gemini usage buckets must use the period enum, not reset order

- **Trap:** The Gemini usage bar could swap the 5h and weekly limits. The parser inferred bucket
  labels from reset order. That breaks when the weekly reset is sooner than the rolling 5h window.
- **Rule:** Use Gemini's period enum when present. Do not guess labels from reset order when the
  enum is unknown.
- **Guard:** `src/pages/content/usageStatus/__tests__/usageStatus.test.ts`

## Gemini usage parsing must tolerate unknown sibling buckets

- **Trap:** On both Chrome and Edge, refreshing the usage pill from a conversation could finish
  without an error but leave the quota and "updated" timestamp unchanged. Opening `/usage` still
  refreshed the values. Gemini added a `period=4` quota bucket whose tuple layout differs from the
  existing 5h (`period=1`) and weekly (`period=2`) buckets. The parser required every sibling tuple
  to match the known layout, so one unfamiliar bucket caused it to discard the entire
  otherwise-valid HTTP 200 RPC response.
- **Rule:** Recognize a candidate metric array when it contains any valid known tuple, parse its
  members independently, and ignore unfamiliar buckets. Continue to map only `period=1` and
  `period=2`; do not infer unknown periods by position.
- **Guard:** `src/pages/content/usageStatus/__tests__/usageStatus.test.ts` ("ignores unfamiliar
  sibling quota buckets without dropping daily and weekly usage")
