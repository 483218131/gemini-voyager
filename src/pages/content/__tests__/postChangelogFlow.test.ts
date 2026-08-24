import { describe, expect, it, vi } from 'vitest';

import { createPostChangelogFlow } from '../postChangelogFlow';

describe('post-changelog flow', () => {
  it('waits for an open changelog before starting the watermark notice', () => {
    let changelogOpen = true;
    const startWatermarkNotice = vi.fn();
    const flow = createPostChangelogFlow({
      hasOpenChangelog: () => changelogOpen,
      startWatermarkNotice,
      startCoachmarks: vi.fn(),
    });

    flow.start();
    expect(startWatermarkNotice).not.toHaveBeenCalled();

    changelogOpen = false;
    flow.start();
    expect(startWatermarkNotice).toHaveBeenCalledOnce();
  });

  it('starts coachmarks only after the watermark notice settles', () => {
    let settleNotice: (() => void) | undefined;
    const startCoachmarks = vi.fn();
    const schedule = vi.fn((callback: () => void) => callback());
    const flow = createPostChangelogFlow({
      hasOpenChangelog: () => false,
      startWatermarkNotice: (onSettled) => {
        settleNotice = onSettled;
      },
      startCoachmarks,
      schedule,
    });

    flow.start();
    expect(startCoachmarks).not.toHaveBeenCalled();

    settleNotice?.();
    expect(schedule).toHaveBeenCalledWith(startCoachmarks, 1200);
    expect(startCoachmarks).toHaveBeenCalledOnce();
  });

  it('does not restart either stage when callbacks fire more than once', () => {
    let settleNotice: (() => void) | undefined;
    const startWatermarkNotice = vi.fn((onSettled: () => void) => {
      settleNotice = onSettled;
    });
    const startCoachmarks = vi.fn();
    const flow = createPostChangelogFlow({
      hasOpenChangelog: () => false,
      startWatermarkNotice,
      startCoachmarks,
      schedule: (callback) => callback(),
    });

    flow.start();
    flow.start();
    settleNotice?.();
    settleNotice?.();

    expect(startWatermarkNotice).toHaveBeenCalledOnce();
    expect(startCoachmarks).toHaveBeenCalledOnce();
  });
});
