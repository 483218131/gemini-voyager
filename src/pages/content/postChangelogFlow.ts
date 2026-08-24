const COACHMARK_DELAY_MS = 1200;

export interface PostChangelogFlowOptions {
  hasOpenChangelog: () => boolean;
  startWatermarkNotice: (onSettled: () => void) => void;
  startCoachmarks: () => void;
  schedule?: (callback: () => void, delayMs: number) => void;
}

/**
 * Keep release-time interruptions sequential: changelog, watermark notice,
 * then optional coachmarks. `start` is safe to call both when changelog setup
 * finishes and again when an open changelog closes.
 */
export function createPostChangelogFlow({
  hasOpenChangelog,
  startWatermarkNotice,
  startCoachmarks,
  schedule = (callback, delayMs) => {
    window.setTimeout(callback, delayMs);
  },
}: PostChangelogFlowOptions): { start: () => void } {
  let noticeStarted = false;
  let coachmarksScheduled = false;

  const scheduleCoachmarks = () => {
    if (coachmarksScheduled) return;
    coachmarksScheduled = true;
    schedule(startCoachmarks, COACHMARK_DELAY_MS);
  };

  const start = () => {
    if (noticeStarted || hasOpenChangelog()) return;
    noticeStarted = true;
    try {
      startWatermarkNotice(scheduleCoachmarks);
    } catch {
      scheduleCoachmarks();
    }
  };

  return { start };
}
