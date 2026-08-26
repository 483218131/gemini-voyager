# State, identity, and sync regression notes

Read this file when changing account or route identity, extension message lifetimes, storage
mirrors, clear markers, or Drive sync.

## Route indexes are not durable account identities

- **Trap:** Prompt History could show one Google account's prompts after another account reused the
  same Gemini `/u/<index>` route. Prompt History persisted the route index directly, and the shared
  account resolver also preferred a stale route alias when it observed a new email on that route.
- **Rule:** Resolve Prompt History storage through `AccountIsolationService`, require an explicit
  stable scope for every write, and let an observed email override a route alias owned by a
  different email.
- **Guard:** `src/core/services/__tests__/AccountIsolationService.test.ts`
  (`does not reuse a route alias after that route switches to another email`) and
  `src/pages/content/promptHistory/__tests__/promptHistory.test.ts`
  (`keeps captures separate when the same route switches to another account`).

## onMessage listeners must not return true unconditionally

- **Trap:** Background broadcasts (e.g. `gv.remoteAnnouncement.show` via `chrome.tabs.sendMessage`)
  hung forever on tabs running the folder content scripts; `await Promise.all` over the broadcast
  never settled. Per-tab `catch` did not help because the promise neither resolved nor rejected.
  Both folder `runtime.onMessage` listeners (Gemini `manager.ts` and `aistudio.ts`) ended with an
  unconditional `return true`, telling Chrome "I will respond asynchronously" for every message,
  including types they never answer. A message with no responder anywhere on the page then keeps the
  channel open forever. `return true` is only safe on branches that actually call `sendResponse`.
- **Rule:** Return `true` only from branches that respond; fall through to `return undefined` for
  unknown messages so the sender's promise settles immediately. Any new content-script onMessage
  listener must follow this.
- **Guard:** `src/pages/content/folder/__tests__/auditFixes.test.ts` ("returns undefined for unknown
  messages so the sender promise settles")
  `src/pages/content/folder/__tests__/aistudioAuditFixes.test.ts`

## Folder storage mirror writes echo back through storage.onChanged

- **Trap:** Every local folder save (star, drag, expand/collapse) triggered a redundant full
  `loadData` + `renderAllFolders`, and rapid consecutive edits could briefly flash the UI back to a
  stale state. `FolderStorageAdapter.saveData` mirrors folder data into `chrome.storage.local`, and
  `chrome.storage.onChanged` fires in the SAME context that performed the write (unlike the window
  `storage` event). The manager's onChanged handler treated its own mirror write as an external
  change and reloaded.
- **Rule:** `armStorageEchoSuppression()` (counter + 2s window) is called before every
  `storage.saveData`; the onChanged handler consumes one suppression per echo and still reloads on
  genuine external writes (popup sync, other tabs). Any new `storage.saveData` call site must arm
  the suppression first.
- **Guard:** `src/pages/content/folder/__tests__/auditFixes.test.ts` ("skips the reload for our own
  mirror-write echo", "still reloads for external writes")

## Highlight cleanup must preserve account clear markers

- **Trap:** After a user cleared all highlights from Storage Manager, a later Google Drive pull
  could restore the deleted highlights. Deleting every `gvAnnotation:*` key also deleted the bounded
  account/platform clear marker. Without that marker, an older remote record looked newer than an
  empty local store and was imported again.
- **Rule:** Highlight cleanup must go through `HighlightAnnotationService.clearAllAccounts()`. It
  removes annotation buckets in one serialized commit while retaining small versioned clear markers.
  Quota classification counts only `gvAnnotation:bucket:*` as highlight content;
  `gvAnnotation:index:*` and the device id are protected metadata/settings. Do not replace this path
  with `storage.remove()` over the whole annotation namespace.
- **Guard:** `src/core/services/__tests__/HighlightAnnotationService.test.ts` (`clearAllAccounts`
  cases) and `src/core/services/__tests__/StorageQuotaService.test.ts`
  (`clears the narrowly matched highlights category`).

## Google Drive backup folders need a stable identity beyond their display name

- **Trap:** Drive folder discovery used only the exact display name, while its stable file ID lived
  in memory and the folder had no app-owned marker. A rename, product-name migration, lost cache, or
  concurrent first resolution could therefore create duplicate root backup folders.
- **Rule:** Tag `Voyager Data` with private `appProperties` marker `voyagerDataFolder=1` and resolve
  marked folders first. Recover pre-marker renames from known sync-file parents, rename only an
  unambiguous legacy folder in place, serialize first resolution, and preserve custom names after
  marking. If canonical and legacy folders coexist, never delete or rename either automatically.
  Search inside the resolved folder before global fallback.
- **Guard:** `src/core/services/__tests__/GoogleDriveSyncService.test.ts` and
  `Voyager/Tests/NativeSupportTests.swift` cover identity and unambiguous migration. A live Drive
  check must preserve folder ID, parent, and JSON while changing only the legacy display name.

## Gemini turn identity must not come from the mounted DOM index

- **Trap:** Gemini virtualizes long conversations, so the first mounted node after reload might be
  turn 60 but receive DOM index `u-0`. Using that index moved stars to wrong turns and could delete
  the original bookmark when unstarred. Prompt text is not identity because it can repeat, change,
  truncate, or render differently.
- **Rule:** Use response `rid` as canonical `s-<rid>` identity. Cache the bounded complete ordered
  ID list from `hNvQHb`, including unmounted turns, and use it to map legacy `u-N` records. Never
  infer aliases from the mounted DOM or prompt text. Without the complete map, retain the legacy
  record but do not show, migrate, or delete it. Timeline, hierarchy, timestamps, forks, highlights,
  and exports share this resolver.
- **Guard:** `src/pages/content/timeline/__tests__/starredResolution.test.ts`,
  `src/pages/content/timeline/__tests__/TimelineManagerStarredRelocation.test.ts`,
  `src/pages/content/timeline/__tests__/TimelineManagerIdentityAliases.test.ts`, and
  `src/pages/content/timestamp/__tests__/historyTimestamps.test.ts` cover complete-map identity and
  safe legacy handling.
