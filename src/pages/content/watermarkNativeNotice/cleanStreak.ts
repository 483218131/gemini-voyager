import { StorageKeys } from '@/core/types/common';

import type { WatermarkPresence } from '../watermarkRemover/watermarkEngine';

/**
 * Consecutive watermark-free Gemini images needed before we tell the user we
 * can see their images are already clean. Three in a row rules out a one-off
 * crop, a re-uploaded photo, or an image that simply missed every anchor.
 */
export const CLEAN_IMAGE_STREAK_THRESHOLD = 3;

/**
 * Upper bound on the stored counter. Past the threshold the exact number is
 * meaningless, and capping keeps a long session from writing an ever-growing
 * value to storage.
 */
export const CLEAN_IMAGE_STREAK_CAP = 9;

export function nextCleanStreak(current: unknown, presence: WatermarkPresence): number {
  // Any watermark at all means the native switch is not doing the work here.
  if (presence !== 'none') return 0;
  const base =
    typeof current === 'number' && Number.isFinite(current) && current > 0
      ? Math.floor(current)
      : 0;
  return Math.min(base + 1, CLEAN_IMAGE_STREAK_CAP);
}

export function hasCleanImageStreak(streak: unknown): boolean {
  return typeof streak === 'number' && streak >= CLEAN_IMAGE_STREAK_THRESHOLD;
}

/**
 * Fold one processed image into the stored streak. Writes only when the value
 * actually changes, and stops writing once the threshold is reached — the
 * notice never needs a bigger number than that.
 */
export async function recordWatermarkPresence(presence: WatermarkPresence): Promise<void> {
  try {
    const stored = await chrome.storage.local.get({
      [StorageKeys.WATERMARK_CLEAN_IMAGE_STREAK]: 0,
    });
    const current = stored?.[StorageKeys.WATERMARK_CLEAN_IMAGE_STREAK];
    if (presence === 'none' && hasCleanImageStreak(current)) return;

    const next = nextCleanStreak(current, presence);
    if (next === current) return;

    await chrome.storage.local.set({ [StorageKeys.WATERMARK_CLEAN_IMAGE_STREAK]: next });
  } catch {
    // Bookkeeping only — a failed write just delays the hint.
  }
}
