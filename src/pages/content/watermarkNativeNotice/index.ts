import { StorageKeys } from '@/core/types/common';
import { isSafari } from '@/core/utils/browser';
import { WATERMARK_STORAGE_KEYS, resolveWatermarkSettings } from '@/core/utils/watermarkSettings';
import { getCurrentLanguage } from '@/utils/i18n';
import type { AppLanguage } from '@/utils/language';
import { TRANSLATIONS, type TranslationKey } from '@/utils/translations';

import { hasCleanImageStreak } from './cleanStreak';

/**
 * One-time notice announcing that Gemini itself can now hide the visible
 * "media watermark", which makes Voyager's watermark removal redundant.
 *
 * Google started rolling the switch out on 2026-08-14 and it arrives
 * gradually; work/school accounts and some regions never get it. So the
 * notice never flips the user's settings on its own — it explains where the
 * native switch lives and offers a button the user presses *after* they have
 * turned it off themselves.
 */

export const WATERMARK_NATIVE_NOTICE_DELAY_MS = 3 * 1000;

const NOTICE_CLASS = 'gv-wm-notice';
const STEPS_IMAGE_PATH = 'watermark-native-steps.png';
const DONE_AUTOCLOSE_MS = 1600;

let noticeTimer: number | null = null;
let cleanupActiveNotice: (() => void) | null = null;
let started = false;
let runId = 0;

function t(key: TranslationKey, lang: AppLanguage): string {
  return TRANSLATIONS[lang][key] ?? TRANSLATIONS.en[key] ?? key;
}

function getLocalStorage(defaults: Record<string, unknown>): Promise<Record<string, unknown>> {
  return new Promise((resolve) => {
    try {
      chrome.storage.local.get(defaults, (result) => {
        resolve(result ?? defaults);
      });
    } catch {
      resolve(defaults);
    }
  });
}

function setLocalStorage(values: Record<string, unknown>): Promise<void> {
  return new Promise((resolve) => {
    try {
      chrome.storage.local.set(values, () => resolve());
    } catch {
      resolve();
    }
  });
}

function getRuntimeUrl(path: string): string | null {
  try {
    const scope = globalThis as typeof globalThis & {
      browser?: { runtime?: { getURL?: (assetPath: string) => string } };
      chrome?: { runtime?: { getURL?: (assetPath: string) => string } };
    };
    const getUrl = scope.browser?.runtime?.getURL ?? scope.chrome?.runtime?.getURL;
    return typeof getUrl === 'function' ? getUrl(path) : null;
  } catch {
    return null;
  }
}

export interface WatermarkNativeNoticeState {
  /** The user has already seen (and dismissed) this notice. */
  alreadyShown: boolean;
  /** At least one of Voyager's watermark-removal paths is still enabled. */
  removalActive: boolean;
}

/**
 * Users who already turned Voyager's removal off have nothing to act on, so
 * they are never interrupted. Everyone else sees the notice exactly once.
 */
export function shouldShowWatermarkNativeNotice(state: WatermarkNativeNoticeState): boolean {
  if (state.alreadyShown) return false;
  return state.removalActive;
}

async function markNoticeShown(): Promise<void> {
  await setLocalStorage({ [StorageKeys.WATERMARK_NATIVE_NOTICE_SHOWN]: true });
}

async function disableWatermarkRemoval(): Promise<void> {
  // Only the two current keys are written. The legacy single key is left
  // untouched on purpose: resolveWatermarkSettings gives the new keys
  // precedence, so this is enough to turn both paths off without rewriting
  // settings the user may still rely on if they downgrade.
  try {
    await chrome.storage.sync.set({
      [StorageKeys.WATERMARK_DOWNLOAD_ENABLED]: false,
      [StorageKeys.WATERMARK_PREVIEW_ENABLED]: false,
    });
  } catch {
    // Non-critical: the popup toggle remains available.
  }
}

function removeExistingNotice(): void {
  document.querySelector(`.${NOTICE_CLASS}`)?.remove();
  cleanupActiveNotice = null;
}

function buildStepList(lang: AppLanguage): HTMLOListElement {
  const list = document.createElement('ol');
  list.className = `${NOTICE_CLASS}__steps`;

  const stepKeys: TranslationKey[] = [
    'watermarkNotice_step1',
    'watermarkNotice_step2',
    'watermarkNotice_step3',
  ];

  stepKeys.forEach((key, index) => {
    const item = document.createElement('li');
    item.className = `${NOTICE_CLASS}__step`;

    // The badge number mirrors the numbered markers drawn on the screenshot
    // above, so the text and the image read as one instruction.
    const badge = document.createElement('span');
    badge.className = `${NOTICE_CLASS}__step-badge`;
    badge.textContent = String(index + 1);
    badge.setAttribute('aria-hidden', 'true');

    const text = document.createElement('span');
    text.className = `${NOTICE_CLASS}__step-text`;
    text.textContent = t(key, lang);

    item.appendChild(badge);
    item.appendChild(text);
    list.appendChild(item);
  });

  return list;
}

function mountNotice(lang: AppLanguage, detectedClean: boolean): void {
  if (document.querySelector(`.${NOTICE_CLASS}`)) return;

  const overlay = document.createElement('div');
  overlay.className = NOTICE_CLASS;
  overlay.setAttribute('role', 'presentation');

  const dialog = document.createElement('div');
  dialog.className = `${NOTICE_CLASS}__dialog`;
  dialog.setAttribute('role', 'dialog');
  dialog.setAttribute('aria-modal', 'true');
  dialog.setAttribute('aria-labelledby', 'gv-wm-notice-title');

  const header = document.createElement('div');
  header.className = `${NOTICE_CLASS}__header`;

  const title = document.createElement('h2');
  title.id = 'gv-wm-notice-title';
  title.className = `${NOTICE_CLASS}__title`;
  title.textContent = t('watermarkNotice_title', lang);

  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = `${NOTICE_CLASS}__close`;
  closeBtn.setAttribute('aria-label', t('watermarkNotice_keepCta', lang));
  closeBtn.textContent = '✕';

  header.appendChild(title);
  header.appendChild(closeBtn);

  const body = document.createElement('div');
  body.className = `${NOTICE_CLASS}__body`;

  const bodyText = document.createElement('p');
  bodyText.className = `${NOTICE_CLASS}__lead`;
  bodyText.textContent = t('watermarkNotice_body', lang);
  body.appendChild(bodyText);

  const stepsImageUrl = getRuntimeUrl(STEPS_IMAGE_PATH);
  if (stepsImageUrl) {
    const figure = document.createElement('img');
    figure.className = `${NOTICE_CLASS}__image`;
    figure.src = stepsImageUrl;
    figure.alt = t('watermarkNotice_imageAlt', lang);
    figure.loading = 'lazy';
    body.appendChild(figure);
  }

  body.appendChild(buildStepList(lang));

  if (detectedClean) {
    const detected = document.createElement('p');
    detected.className = `${NOTICE_CLASS}__detected`;
    detected.textContent = t('watermarkNotice_detected', lang);
    body.appendChild(detected);
  }

  const caveat = document.createElement('p');
  caveat.className = `${NOTICE_CLASS}__caveat`;
  caveat.textContent = t('watermarkNotice_caveat', lang);
  body.appendChild(caveat);

  const actions = document.createElement('div');
  actions.className = `${NOTICE_CLASS}__actions`;

  const keepBtn = document.createElement('button');
  keepBtn.type = 'button';
  keepBtn.className = `${NOTICE_CLASS}__btn ${NOTICE_CLASS}__btn--secondary`;
  keepBtn.textContent = t('watermarkNotice_keepCta', lang);

  const disableBtn = document.createElement('button');
  disableBtn.type = 'button';
  disableBtn.className = `${NOTICE_CLASS}__btn ${NOTICE_CLASS}__btn--primary`;
  disableBtn.textContent = t('watermarkNotice_disableCta', lang);

  actions.appendChild(keepBtn);
  actions.appendChild(disableBtn);

  dialog.appendChild(header);
  dialog.appendChild(body);
  dialog.appendChild(actions);
  overlay.appendChild(dialog);
  document.body.appendChild(overlay);

  let doneTimer: number | null = null;

  function teardown(): void {
    if (doneTimer !== null) {
      clearTimeout(doneTimer);
      doneTimer = null;
    }
    document.removeEventListener('keydown', onKeyDown);
    removeExistingNotice();
  }

  function close(): void {
    void markNoticeShown();
    teardown();
  }

  function onKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Escape') close();
  }

  closeBtn.addEventListener('click', close);
  keepBtn.addEventListener('click', close);

  disableBtn.addEventListener('click', () => {
    disableBtn.disabled = true;
    keepBtn.disabled = true;
    void disableWatermarkRemoval().then(() => {
      void markNoticeShown();
      // Confirm in place rather than closing instantly — the user just changed
      // a setting and should see where it can be undone.
      actions.replaceChildren();
      const done = document.createElement('p');
      done.className = `${NOTICE_CLASS}__done`;
      done.setAttribute('role', 'status');
      done.textContent = t('watermarkNotice_done', lang);
      actions.appendChild(done);
      doneTimer = window.setTimeout(teardown, DONE_AUTOCLOSE_MS);
    });
  });

  // Clicking the backdrop deliberately does not dismiss: this notice ships
  // once and explains a change that silently makes a feature obsolete, so it
  // asks for an explicit choice (close, keep, or disable).
  document.addEventListener('keydown', onKeyDown);

  cleanupActiveNotice = () => {
    teardown();
  };
}

async function scheduleNotice(delayMs: number, currentRunId: number): Promise<void> {
  const localDefaults = {
    [StorageKeys.WATERMARK_NATIVE_NOTICE_SHOWN]: false,
    [StorageKeys.WATERMARK_CLEAN_IMAGE_STREAK]: 0,
  };
  const stored = await getLocalStorage(localDefaults);
  if (currentRunId !== runId) return;
  if (stored[StorageKeys.WATERMARK_NATIVE_NOTICE_SHOWN] === true) return;

  let settings;
  try {
    const record = await chrome.storage?.sync?.get([...WATERMARK_STORAGE_KEYS]);
    settings = resolveWatermarkSettings(record ?? null);
  } catch {
    return;
  }
  if (currentRunId !== runId) return;

  const shouldShow = shouldShowWatermarkNativeNotice({
    alreadyShown: stored[StorageKeys.WATERMARK_NATIVE_NOTICE_SHOWN] === true,
    removalActive: settings.download || settings.preview,
  });
  if (!shouldShow) return;

  const detectedClean = hasCleanImageStreak(stored[StorageKeys.WATERMARK_CLEAN_IMAGE_STREAK]);
  const lang = await getCurrentLanguage();
  if (currentRunId !== runId) return;

  noticeTimer = window.setTimeout(async () => {
    if (currentRunId !== runId) return;
    const latest = await getLocalStorage(localDefaults);
    if (currentRunId !== runId) return;
    if (latest[StorageKeys.WATERMARK_NATIVE_NOTICE_SHOWN] === true) return;
    mountNotice(lang, detectedClean);
  }, delayMs);
}

/**
 * Start the one-time native-watermark notice. Returns a cleanup function.
 */
export function startWatermarkNativeNotice(
  delayMs: number = WATERMARK_NATIVE_NOTICE_DELAY_MS,
): () => void {
  // Safari never ran watermark removal, so there is nothing to retire there.
  if (isSafari()) return () => {};
  if (started) return () => {};
  started = true;
  const currentRunId = runId + 1;
  runId = currentRunId;

  // Debug helper: switch the DevTools console context to this content script
  // and call __gvWatermarkNotice() to force the dialog open.
  (window as unknown as Record<string, unknown>).__gvWatermarkNotice = async () => {
    const lang = await getCurrentLanguage();
    removeExistingNotice();
    mountNotice(lang, true);
  };

  void scheduleNotice(delayMs, currentRunId);

  return () => {
    started = false;
    runId += 1;
    if (noticeTimer !== null) {
      clearTimeout(noticeTimer);
      noticeTimer = null;
    }
    cleanupActiveNotice?.();
    removeExistingNotice();
  };
}
