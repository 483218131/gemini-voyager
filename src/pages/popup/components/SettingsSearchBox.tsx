import React, { useEffect, useMemo, useRef, useState } from 'react';

import { History, Search, X } from 'lucide-react';

import { useLanguage } from '@/contexts/LanguageContext';

import { useSettingsSearchHistory } from '../hooks/useSettingsSearchHistory';
import { normalizeSearchText } from '../utils/settingsSearch';

interface SettingsSearchBoxProps {
  value: string;
  onChange: (value: string) => void;
}

const HISTORY_LIST_ID = 'gv-popup-settings-search-history';

export function SettingsSearchBox({ value, onChange }: SettingsSearchBoxProps) {
  const { t } = useLanguage();
  const { history, commitQuery, markHistorySelection, removeQuery } =
    useSettingsSearchHistory(value);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const rootRef = useRef<HTMLDivElement>(null);
  const normalizedQuery = normalizeSearchText(value);
  const suggestions = useMemo(
    () =>
      history.filter((item) => {
        const normalizedItem = normalizeSearchText(item);
        if (normalizedItem === normalizedQuery) return false;
        return !normalizedQuery || normalizedItem.includes(normalizedQuery);
      }),
    [history, normalizedQuery],
  );
  const menuVisible = open && suggestions.length > 0;

  useEffect(() => {
    setActiveIndex((current) => (current < suggestions.length ? current : -1));
  }, [suggestions.length]);

  useEffect(() => {
    if (!open) return;
    const closeOutside = (event: Event) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
        setActiveIndex(-1);
      }
    };
    document.addEventListener('mousedown', closeOutside);
    document.addEventListener('focusin', closeOutside);
    return () => {
      document.removeEventListener('mousedown', closeOutside);
      document.removeEventListener('focusin', closeOutside);
    };
  }, [open]);

  const selectSuggestion = (suggestion: string) => {
    markHistorySelection(suggestion);
    onChange(suggestion);
    setOpen(false);
    setActiveIndex(-1);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') {
      setOpen(false);
      setActiveIndex(-1);
      return;
    }
    if (event.key === 'ArrowDown' && suggestions.length > 0) {
      event.preventDefault();
      setOpen(true);
      setActiveIndex((current) => (current + 1) % suggestions.length);
      return;
    }
    if (event.key === 'ArrowUp' && suggestions.length > 0) {
      event.preventDefault();
      setOpen(true);
      setActiveIndex((current) => (current <= 0 ? suggestions.length - 1 : current - 1));
      return;
    }
    if (event.key !== 'Enter') return;
    if (menuVisible && activeIndex >= 0) {
      event.preventDefault();
      selectSuggestion(suggestions[activeIndex]);
      return;
    }
    commitQuery(value);
    setOpen(false);
  };

  return (
    <div
      ref={rootRef}
      role="group"
      aria-label={t('popupSettingsSearchPlaceholder')}
      className="relative"
    >
      <Search
        className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2"
        aria-hidden="true"
      />
      <input
        type="search"
        role="combobox"
        value={value}
        onChange={(event) => {
          onChange(event.target.value);
          setOpen(true);
          setActiveIndex(-1);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={handleKeyDown}
        placeholder={t('popupSettingsSearchPlaceholder')}
        aria-label={t('popupSettingsSearchPlaceholder')}
        aria-autocomplete="list"
        aria-expanded={menuVisible}
        aria-controls={menuVisible ? HISTORY_LIST_ID : undefined}
        aria-activedescendant={
          menuVisible && activeIndex >= 0 ? `${HISTORY_LIST_ID}-${activeIndex}` : undefined
        }
        className="bg-card border-border focus:ring-primary/40 w-full rounded-lg border py-2 pr-9 pl-9 text-sm shadow-sm transition-all outline-none focus:ring-2"
      />
      {value && (
        <button
          type="button"
          onPointerDown={(event) => event.preventDefault()}
          onClick={() => {
            onChange('');
            setOpen(history.length > 0);
            setActiveIndex(-1);
          }}
          className="text-muted-foreground hover:text-foreground absolute top-1/2 right-2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-md transition-colors"
          aria-label={t('popupSettingsSearchClear')}
          title={t('popupSettingsSearchClear')}
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      )}

      {menuVisible && (
        <div className="border-border bg-background absolute top-full right-0 left-0 z-50 mt-1.5 overflow-hidden rounded-xl border shadow-xl">
          <div className="text-muted-foreground px-3 pt-2 pb-1 text-[11px] font-semibold tracking-wide">
            {t('popupSettingsSearchHistory')}
          </div>
          <div
            id={HISTORY_LIST_ID}
            role="listbox"
            aria-label={t('popupSettingsSearchHistory')}
            className="max-h-44 overflow-y-auto p-1"
          >
            {suggestions.map((suggestion, index) => (
              <div
                key={normalizeSearchText(suggestion)}
                id={`${HISTORY_LIST_ID}-${index}`}
                role="option"
                tabIndex={-1}
                aria-selected={index === activeIndex}
                className={`group flex items-center rounded-lg transition-colors ${
                  index === activeIndex ? 'bg-muted' : 'hover:bg-muted/70'
                }`}
                onMouseEnter={() => setActiveIndex(index)}
              >
                <button
                  type="button"
                  onClick={() => selectSuggestion(suggestion)}
                  className="text-foreground flex min-w-0 flex-1 items-center gap-2 px-2 py-2 text-left text-sm"
                >
                  <History
                    className="text-muted-foreground h-3.5 w-3.5 shrink-0"
                    aria-hidden="true"
                  />
                  <span className="truncate" dir="auto">
                    {suggestion}
                  </span>
                </button>
                <button
                  type="button"
                  onPointerDown={(event) => event.preventDefault()}
                  onClick={(event) => {
                    event.stopPropagation();
                    removeQuery(suggestion);
                    setActiveIndex(-1);
                  }}
                  className="text-muted-foreground hover:text-foreground mr-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-md opacity-70 transition-colors group-hover:opacity-100 hover:bg-black/5 focus:opacity-100"
                  aria-label={t('popupSettingsSearchHistoryRemove')}
                  title={t('popupSettingsSearchHistoryRemove')}
                >
                  <X className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
