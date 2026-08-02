import React, { act, useLayoutEffect } from 'react';
import { type Root, createRoot } from 'react-dom/client';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { StorageKeys } from '@/core/types/common';

import {
  SETTINGS_SEARCH_HISTORY_SAVE_DELAY_MS,
  removeSettingsSearchHistoryEntry,
  sanitizeSettingsSearchHistory,
  upsertSettingsSearchHistory,
  useSettingsSearchHistory,
} from '../useSettingsSearchHistory';

const mocks = vi.hoisted(() => ({
  storageGet: vi.fn(),
  storageSet: vi.fn(),
}));

vi.mock('webextension-polyfill', () => ({
  default: {
    storage: {
      local: { get: mocks.storageGet, set: mocks.storageSet },
    },
  },
}));

type SearchHistoryState = ReturnType<typeof useSettingsSearchHistory>;

function Harness({
  query,
  onState,
}: {
  query: string;
  onState: (state: SearchHistoryState) => void;
}) {
  const state = useSettingsSearchHistory(query);
  useLayoutEffect(() => onState(state), [onState, state]);
  return null;
}

describe('settings search history helpers', () => {
  it('sanitizes malformed values and deduplicates normalized queries', () => {
    expect(sanitizeSettingsSearchHistory([' Timeline ', 'timeline', null, '', 'Folders'])).toEqual([
      'Timeline',
      'Folders',
    ]);
  });

  it('replaces the prior autosaved draft without pruning older searches', () => {
    const withDraft = upsertSettingsSearchHistory(['Folders', 'Theme'], 'time');
    expect(upsertSettingsSearchHistory(withDraft, 'timeline', 'time')).toEqual([
      'timeline',
      'Folders',
      'Theme',
    ]);
    expect(removeSettingsSearchHistoryEntry(withDraft, 'folders')).toEqual(['time', 'Theme']);
  });
});

describe('useSettingsSearchHistory', () => {
  let container: HTMLDivElement;
  let root: Root;
  let latestState: SearchHistoryState;
  const receiveState = (state: SearchHistoryState) => {
    latestState = state;
  };

  const renderQuery = async (query: string) => {
    await act(async () => {
      root.render(<Harness query={query} onState={receiveState} />);
      await Promise.resolve();
    });
  };

  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    vi.useFakeTimers();
    mocks.storageGet.mockReset().mockResolvedValue({
      [StorageKeys.GV_POPUP_SETTINGS_SEARCH_HISTORY]: ['Folders'],
    });
    mocks.storageSet.mockReset().mockResolvedValue(undefined);
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    vi.clearAllTimers();
    vi.useRealTimers();
    container.remove();
  });

  it('autosaves a settled query and updates its draft as typing continues', async () => {
    await renderQuery('ti');
    await act(() => vi.advanceTimersByTimeAsync(SETTINGS_SEARCH_HISTORY_SAVE_DELAY_MS));
    expect(mocks.storageSet).toHaveBeenLastCalledWith({
      [StorageKeys.GV_POPUP_SETTINGS_SEARCH_HISTORY]: ['ti', 'Folders'],
    });

    await renderQuery('timeline');
    await act(() => vi.advanceTimersByTimeAsync(SETTINGS_SEARCH_HISTORY_SAVE_DELAY_MS));
    expect(mocks.storageSet).toHaveBeenLastCalledWith({
      [StorageKeys.GV_POPUP_SETTINGS_SEARCH_HISTORY]: ['timeline', 'Folders'],
    });

    await act(async () => {
      latestState.removeQuery('Folders');
      await Promise.resolve();
    });
    expect(mocks.storageSet).toHaveBeenLastCalledWith({
      [StorageKeys.GV_POPUP_SETTINGS_SEARCH_HISTORY]: ['timeline'],
    });
  });

  it('does not resave a history entry merely because the user selected it', async () => {
    await renderQuery('');
    act(() => latestState.markHistorySelection('Folders'));
    await renderQuery('Folders');
    await act(() => vi.advanceTimersByTimeAsync(SETTINGS_SEARCH_HISTORY_SAVE_DELAY_MS));

    expect(mocks.storageSet).not.toHaveBeenCalled();
  });
});
