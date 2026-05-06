import { beforeEach, describe, expect, it, vi } from 'vitest';

import { TimelineManager } from '../manager';
import type { StarredMessagesData } from '../starredTypes';

type PreviewUpdate = {
  id: string;
  summary: string;
  index: number;
  starred: boolean;
  starredAt?: number;
};

type TimelineManagerInternal = {
  conversationId: string | null;
  starred: Set<string>;
  starredAtMap: Map<string, number>;
  markers: Array<{
    id: string;
    element: HTMLElement;
    summary: string;
    n: number;
    baseN: number;
    dotElement: null;
    starred: boolean;
  }>;
  previewPanel: { updateMarkers: ReturnType<typeof vi.fn> } | null;
  saveStars: () => void;
  applySharedStarredData: (data?: StarredMessagesData | null) => void;
};

function createMarker(
  id: string,
  summary: string,
  starred = false,
): TimelineManagerInternal['markers'][number] {
  return {
    id,
    element: document.createElement('div'),
    summary,
    n: 0,
    baseN: 0,
    dotElement: null,
    starred,
  };
}

function getLastPreviewUpdate(updateMarkers: ReturnType<typeof vi.fn>): PreviewUpdate[] {
  return updateMarkers.mock.calls.at(-1)?.[0] as PreviewUpdate[];
}

describe('TimelineManager preview starred sync', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  it('pushes add and remove starred changes into the preview panel immediately', () => {
    const manager = new TimelineManager();
    const updateMarkers = vi.fn();
    const internal = manager as unknown as TimelineManagerInternal;

    internal.conversationId = 'gemini:conv:test';
    internal.starred = new Set();
    internal.starredAtMap = new Map();
    internal.markers = [createMarker('turn-0', 'first'), createMarker('turn-1', 'second')];
    internal.previewPanel = { updateMarkers };
    internal.saveStars = vi.fn();

    internal.applySharedStarredData({
      messages: {
        'gemini:conv:test': [
          {
            turnId: 'turn-1',
            content: 'second',
            conversationId: 'gemini:conv:test',
            conversationUrl: 'https://gemini.google.com/app/test',
            conversationTitle: 'test',
            starredAt: 1710000000000,
          },
        ],
      },
    });

    let previewMarkers = getLastPreviewUpdate(updateMarkers);
    expect(previewMarkers[1]?.starred).toBe(true);
    expect(previewMarkers[1]?.starredAt).toBe(1710000000000);

    internal.applySharedStarredData({
      messages: {
        'gemini:conv:test': [],
      },
    });

    previewMarkers = getLastPreviewUpdate(updateMarkers);
    expect(previewMarkers[1]?.starred).toBe(false);
    expect(previewMarkers[1]?.starredAt).toBeUndefined();
  });

  it('refreshes preview metadata even when the starred id set is unchanged', () => {
    const manager = new TimelineManager();
    const updateMarkers = vi.fn();
    const internal = manager as unknown as TimelineManagerInternal;

    internal.conversationId = 'gemini:conv:test';
    internal.starred = new Set(['turn-1']);
    internal.starredAtMap = new Map([['turn-1', 100]]);
    internal.markers = [createMarker('turn-0', 'first'), createMarker('turn-1', 'second', true)];
    internal.previewPanel = { updateMarkers };
    internal.saveStars = vi.fn();

    internal.applySharedStarredData({
      messages: {
        'gemini:conv:test': [
          {
            turnId: 'turn-1',
            content: 'second',
            conversationId: 'gemini:conv:test',
            conversationUrl: 'https://gemini.google.com/app/test',
            conversationTitle: 'test',
            starredAt: 200,
          },
        ],
      },
    });

    const previewMarkers = getLastPreviewUpdate(updateMarkers);
    expect(previewMarkers[1]?.starred).toBe(true);
    expect(previewMarkers[1]?.starredAt).toBe(200);
  });
});
