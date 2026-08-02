import React, { act, useState } from 'react';
import { type Root, createRoot } from 'react-dom/client';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SettingsSearchBox } from '../SettingsSearchBox';

const mocks = vi.hoisted(() => ({
  commitQuery: vi.fn(),
  markHistorySelection: vi.fn(),
  removeQuery: vi.fn(),
  useSettingsSearchHistory: vi.fn(),
}));

vi.mock('@/contexts/LanguageContext', () => ({
  useLanguage: () => ({ t: (key: string) => key }),
}));

vi.mock('../../hooks/useSettingsSearchHistory', () => ({
  useSettingsSearchHistory: mocks.useSettingsSearchHistory,
}));

function ControlledSearchBox() {
  const [value, setValue] = useState('');
  return <SettingsSearchBox value={value} onChange={setValue} />;
}

describe('SettingsSearchBox', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(async () => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    vi.clearAllMocks();
    mocks.useSettingsSearchHistory.mockReturnValue({
      history: ['Timeline', 'Folders'],
      commitQuery: mocks.commitQuery,
      markHistorySelection: mocks.markHistorySelection,
      removeQuery: mocks.removeQuery,
    });
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => root.render(<ControlledSearchBox />));
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it('shows persistent history on focus and supports explicit deletion', () => {
    const input = container.querySelector<HTMLInputElement>('input[type="search"]')!;
    act(() => input.focus());

    expect(container.querySelector('[role="listbox"]')).not.toBeNull();
    const removeButtons = Array.from(
      container.querySelectorAll<HTMLButtonElement>(
        'button[aria-label="popupSettingsSearchHistoryRemove"]',
      ),
    );
    expect(removeButtons).toHaveLength(2);

    act(() => removeButtons[0].click());
    expect(mocks.removeQuery).toHaveBeenCalledWith('Timeline');
  });

  it('supports keyboard selection from recent searches', () => {
    const input = container.querySelector<HTMLInputElement>('input[type="search"]')!;
    act(() => {
      input.focus();
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    });
    act(() => {
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    });

    expect(mocks.markHistorySelection).toHaveBeenCalledWith('Timeline');
    expect(input.value).toBe('Timeline');
  });
});
