import browser from 'webextension-polyfill';

export type RuntimeImageFetchMessageType = 'gv.fetchImage' | 'gv.fetchImageViaPage';

export const MAX_RUNTIME_IMAGE_BYTES = 8 * 1024 * 1024;

const RUNTIME_IMAGE_EXACT_HOSTS = new Set([
  'googleusercontent.com',
  'ggpht.com',
  'lh3.google.com',
  'oaistatic.com',
  'oaiusercontent.com',
  'openai.com',
]);

export const RUNTIME_IMAGE_HOST_SUFFIXES = [
  '.googleusercontent.com',
  '.ggpht.com',
  '.oaistatic.com',
  '.oaiusercontent.com',
  '.openai.com',
] as const;

export const RUNTIME_IMAGE_ALLOWED_HOSTS = [...RUNTIME_IMAGE_EXACT_HOSTS] as const;

function parseHttpsUrl(rawUrl: string | undefined): URL | null {
  if (!rawUrl) return null;
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password) return null;
    return parsed;
  } catch {
    return null;
  }
}

function isRuntimeImageHostAllowed(hostname: string): boolean {
  const normalized = hostname.toLowerCase();
  return (
    RUNTIME_IMAGE_EXACT_HOSTS.has(normalized) ||
    RUNTIME_IMAGE_HOST_SUFFIXES.some((suffix) => normalized.endsWith(suffix))
  );
}

/**
 * Restrict the privileged image relay to known media hosts or the sender page's
 * own HTTPS origin. The latter preserves same-origin exports without turning a
 * content script into a general cross-origin credentialed fetch proxy.
 */
export function parseAllowedRuntimeImageUrl(rawUrl: string, senderPageUrl?: string): URL | null {
  const parsed = parseHttpsUrl(rawUrl);
  if (!parsed) return null;
  if (isRuntimeImageHostAllowed(parsed.hostname)) return parsed;

  const senderPage = parseHttpsUrl(senderPageUrl);
  return senderPage?.origin === parsed.origin ? parsed : null;
}

export function isAllowedRuntimeImageBody(contentType: string, size: number): boolean {
  const normalizedType = contentType.split(';', 1)[0]?.trim().toLowerCase() ?? '';
  return (
    normalizedType.startsWith('image/') &&
    Number.isFinite(size) &&
    size > 0 &&
    size <= MAX_RUNTIME_IMAGE_BYTES
  );
}

export interface RuntimeImageData {
  base64: string;
  contentType: string;
}

interface RuntimeImageResponse {
  ok?: boolean;
  base64?: unknown;
  contentType?: unknown;
}

async function sendRuntimeImageRequest(
  type: RuntimeImageFetchMessageType,
  url: string,
): Promise<RuntimeImageData | null> {
  try {
    const response = (await browser.runtime.sendMessage({ type, url })) as RuntimeImageResponse;
    if (response?.ok !== true || typeof response.base64 !== 'string') return null;
    return {
      base64: response.base64,
      contentType:
        typeof response.contentType === 'string' && response.contentType
          ? response.contentType
          : 'application/octet-stream',
    };
  } catch {
    return null;
  }
}

/**
 * Fetch authenticated page images through the extension. The background fetch
 * is fastest when host permissions are sufficient; MAIN-world fetch is the
 * Safari/Firefox fallback because it shares the page's Google session.
 */
export async function fetchImageViaExtensionRuntime(url: string): Promise<RuntimeImageData | null> {
  const backgroundResult = await sendRuntimeImageRequest('gv.fetchImage', url);
  if (backgroundResult) return backgroundResult;
  if (url.startsWith('blob:')) return null;
  return await sendRuntimeImageRequest('gv.fetchImageViaPage', url);
}
