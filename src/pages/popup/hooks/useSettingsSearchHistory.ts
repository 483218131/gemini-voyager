import { useCallback, useEffect, useRef, useState } from 'react';

import browser from 'webextension-polyfill';

import { StorageKeys } from '@/core/types/common';

import { normalizeSearchText } from '../utils/settingsSearch';

export const SETTINGS_SEARCH_HISTORY_SAVE_DELAY_MS = 500;

function historyKey(value: string): string {
  return normalizeSearchText(value.trim());
}

export function sanitizeSettingsSearchHistory(value: unknown): string[] {
  if (!Array.isArray(value)) return [];

  const seen = new Set<string>();
  const history: string[] = [];
  for (const item of value) {
    if (typeof item !== 'string') continue;
    const trimmed = item.trim();
    const key = historyKey(trimmed);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    history.push(trimmed);
  }
  return history;
}

/**
 * Put the latest query first while replacing the prior autosaved draft from
 * the same editing session. This prevents a pause while typing from leaving a
 * ladder of partial queries in history.
 */
export function upsertSettingsSearchHistory(
  history: readonly string[],
  query: string,
  previousDraft: string | null = null,
): string[] {
  const trimmed = query.trim();
  const queryKey = historyKey(trimmed);
  if (!queryKey) return sanitizeSettingsSearchHistory(history);

  const previousDraftKey = previousDraft ? historyKey(previousDraft) : '';
  return [
    trimmed,
    ...sanitizeSettingsSearchHistory(history).filter((item) => {
      const key = historyKey(item);
      return key !== queryKey && (!previousDraftKey || key !== previousDraftKey);
    }),
  ];
}

export function removeSettingsSearchHistoryEntry(
  history: readonly string[],
  query: string,
): string[] {
  const queryKey = historyKey(query);
  return sanitizeSettingsSearchHistory(history).filter((item) => historyKey(item) !== queryKey);
}

interface SettingsSearchHistoryState {
  history: readonly string[];
  commitQuery: (query: string) => void;
  markHistorySelection: (query: string) => void;
  removeQuery: (query: string) => void;
}

export function useSettingsSearchHistory(query: string): SettingsSearchHistoryState {
  const [history, setHistory] = useState<string[]>([]);
  const [loaded, setLoaded] = useState(false);
  const historyRef = useRef<string[]>([]);
  const draftQueryRef = useRef<string | null>(null);
  const selectedHistoryKeyRef = useRef<string | null>(null);
  const writeQueueRef = useRef<Promise<void>>(Promise.resolve());

  const applyHistory = useCallback((next: string[], persist: boolean) => {
    historyRef.current = next;
    setHistory(next);
    if (!persist) return;
    writeQueueRef.current = writeQueueRef.current
      .catch(() => undefined)
      .then(() =>
        browser.storage.local.set({ [StorageKeys.GV_POPUP_SETTINGS_SEARCH_HISTORY]: next }),
      )
      .catch(() => undefined);
  }, []);

  const commitQuery = useCallback(
    (nextQuery: string) => {
      const trimmed = nextQuery.trim();
      if (!historyKey(trimmed)) return;
      const next = upsertSettingsSearchHistory(historyRef.current, trimmed, draftQueryRef.current);
      draftQueryRef.current = trimmed;
      applyHistory(next, true);
    },
    [applyHistory],
  );

  const markHistorySelection = useCallback((selectedQuery: string) => {
    selectedHistoryKeyRef.current = historyKey(selectedQuery);
    draftQueryRef.current = null;
  }, []);

  const removeQuery = useCallback(
    (removedQuery: string) => {
      const removedKey = historyKey(removedQuery);
      if (draftQueryRef.current && historyKey(draftQueryRef.current) === removedKey) {
        draftQueryRef.current = null;
      }
      applyHistory(removeSettingsSearchHistoryEntry(historyRef.current, removedQuery), true);
    },
    [applyHistory],
  );

  useEffect(() => {
    let cancelled = false;
    void browser.storage.local
      .get({ [StorageKeys.GV_POPUP_SETTINGS_SEARCH_HISTORY]: [] })
      .then((result) => {
        if (cancelled) return;
        const next = sanitizeSettingsSearchHistory(
          result[StorageKeys.GV_POPUP_SETTINGS_SEARCH_HISTORY],
        );
        applyHistory(next, false);
        setLoaded(true);
      })
      .catch(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [applyHistory]);

  useEffect(() => {
    if (!loaded) return;
    const trimmed = query.trim();
    const key = historyKey(trimmed);
    if (!key) {
      draftQueryRef.current = null;
      selectedHistoryKeyRef.current = null;
      return;
    }

    if (selectedHistoryKeyRef.current === key) {
      selectedHistoryKeyRef.current = null;
      return;
    }

    const timer = window.setTimeout(
      () => commitQuery(trimmed),
      SETTINGS_SEARCH_HISTORY_SAVE_DELAY_MS,
    );
    return () => window.clearTimeout(timer);
  }, [commitQuery, loaded, query]);

  return { history, commitQuery, markHistorySelection, removeQuery };
}
