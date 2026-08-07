import { StorageKeys } from '@/core/types/common';
import { customWebsitesIncludeHost } from '@/core/utils/customWebsites';

export interface PromptManagerInstance {
  destroy: () => void;
}

export interface CustomSiteCoverageOptions {
  /** Lowercased `location.host` of the page this content script runs in. */
  host: string;
  /** Mounts the Prompt Manager. Called only when coverage turns on. */
  start: () => Promise<PromptManagerInstance>;
  /** The instance mounted at startup, or null if the site was not covered. */
  initial: PromptManagerInstance | null;
}

export interface CustomSiteCoverageReconciler {
  /** `chrome.storage.onChanged` listener. */
  handleChange: (changes: Record<string, chrome.storage.StorageChange>, areaName: string) => void;
  /** Resolves once every change queued so far has been applied. */
  settled: () => Promise<void>;
  /** Tears down whatever is currently mounted. */
  destroy: () => void;
}

/**
 * Keeps the Prompt Manager in sync with the stored custom-website list while the
 * page stays open.
 *
 * Unregistering a dynamic content script only affects future navigations, so a
 * site toggled off in the popup would otherwise keep its Prompt Manager until
 * the user reloaded. Mounting and destroying are serialized on one queue: a
 * rapid off/on must not interleave two `start()` calls and leave two instances
 * mounted.
 */
export function createCustomSiteCoverageReconciler({
  host,
  start,
  initial,
}: CustomSiteCoverageOptions): CustomSiteCoverageReconciler {
  let instance: PromptManagerInstance | null = initial;
  let queue: Promise<void> = Promise.resolve();

  const handleChange = (
    changes: Record<string, chrome.storage.StorageChange>,
    areaName: string,
  ): void => {
    if (areaName !== 'sync') return;
    const change = changes[StorageKeys.PROMPT_CUSTOM_WEBSITES];
    if (!change) return;

    const covered = customWebsitesIncludeHost(change.newValue, host);
    queue = queue
      .then(async () => {
        // Read coverage at apply time, not at enqueue time, so a no-op change
        // never remounts an already-mounted instance.
        if (covered === (instance !== null)) return;
        if (covered) {
          instance = await start();
          return;
        }
        instance?.destroy();
        instance = null;
      })
      .catch(() => {});
  };

  return {
    handleChange,
    settled: () => queue,
    destroy: () => {
      instance?.destroy();
      instance = null;
    },
  };
}
