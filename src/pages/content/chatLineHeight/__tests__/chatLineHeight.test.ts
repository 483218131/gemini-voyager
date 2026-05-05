import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const STYLE_ID = 'gemini-voyager-chat-line-height';
const VALUE_KEY = 'gvChatLineHeight';
const ENABLED_KEY = 'gvChatLineHeightEnabled';

type StorageChangeListener = (
  changes: Record<string, chrome.storage.StorageChange>,
  area: string,
) => void;

function getInjectedStyle(): HTMLStyleElement | null {
  return document.getElementById(STYLE_ID) as HTMLStyleElement | null;
}

describe('chatLineHeight', () => {
  let storageChangeListeners: StorageChangeListener[];

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();

    document.head.innerHTML = '';
    document.body.innerHTML = '<main></main>';

    storageChangeListeners = [];

    (chrome.storage.sync.get as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      (_keys: unknown, callback: (value: Record<string, unknown>) => void) => {
        callback({ [VALUE_KEY]: 175, [ENABLED_KEY]: true });
      },
    );

    (
      chrome.storage.onChanged.addListener as unknown as ReturnType<typeof vi.fn>
    ).mockImplementation((listener: StorageChangeListener) => {
      storageChangeListeners.push(listener);
    });
  });

  afterEach(() => {
    window.dispatchEvent(new Event('beforeunload'));
  });

  it('applies line-height styles when enabled', async () => {
    const { startChatLineHeightAdjuster } = await import('../index');
    startChatLineHeightAdjuster();

    const style = getInjectedStyle();
    expect(style).not.toBeNull();
    expect(style!.textContent).toContain('line-height: 1.75 !important');
  });

  it('does not inject styles when disabled', async () => {
    (chrome.storage.sync.get as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      (_keys: unknown, callback: (value: Record<string, unknown>) => void) => {
        callback({ [VALUE_KEY]: 175, [ENABLED_KEY]: false });
      },
    );

    const { startChatLineHeightAdjuster } = await import('../index');
    startChatLineHeightAdjuster();

    expect(getInjectedStyle()).toBeNull();
  });

  it('updates line height when storage value changes', async () => {
    const { startChatLineHeightAdjuster } = await import('../index');
    startChatLineHeightAdjuster();

    expect(storageChangeListeners.length).toBeGreaterThan(0);

    storageChangeListeners[0]({ [VALUE_KEY]: { oldValue: 175, newValue: 200 } }, 'sync');

    const style = getInjectedStyle();
    expect(style).not.toBeNull();
    expect(style!.textContent).toContain('line-height: 2 !important');
  });

  it('removes styles when toggled off via storage change', async () => {
    const { startChatLineHeightAdjuster } = await import('../index');
    startChatLineHeightAdjuster();

    expect(getInjectedStyle()).not.toBeNull();

    storageChangeListeners[0]({ [ENABLED_KEY]: { oldValue: true, newValue: false } }, 'sync');

    expect(getInjectedStyle()).toBeNull();
  });

  it('clamps values to min/max range', async () => {
    (chrome.storage.sync.get as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      (_keys: unknown, callback: (value: Record<string, unknown>) => void) => {
        callback({ [VALUE_KEY]: 250, [ENABLED_KEY]: true });
      },
    );

    const { startChatLineHeightAdjuster } = await import('../index');
    startChatLineHeightAdjuster();

    const style = getInjectedStyle();
    expect(style).not.toBeNull();
    expect(style!.textContent).toContain('line-height: 2.2 !important');
  });

  it('targets user, model, markdown, and code response text', async () => {
    const { startChatLineHeightAdjuster } = await import('../index');
    startChatLineHeightAdjuster();

    const text = getInjectedStyle()!.textContent ?? '';
    expect(text).toContain('body .query-text');
    expect(text).toContain('body message-content');
    expect(text).toContain('body model-response .markdown');
    expect(text).toContain('body message-content li');
    expect(text).toContain('body .formatted-code-block-internal-container code');
  });
});
