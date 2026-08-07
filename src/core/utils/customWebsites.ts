const BLOCKED_CUSTOM_WEBSITE_VALUES = new Set([
  '*',
  '*://*/*',
  '<all_urls>',
  'all urls',
  'all_urls',
  'http://*/*',
  'https://*/*',
]);

const IPV4_HOSTNAME = /^\d{1,3}(?:\.\d{1,3}){3}$/;
const REGISTRABLE_HOSTNAME = /^[a-z0-9.-]+\.[a-z]{2,}$/i;

interface CustomWebsiteHost {
  readonly hostname: string;
  readonly port: string | null;
}

/**
 * Hosts with no registrable domain — loopback and bare IPs. A bare entry for one
 * of these would cover *every* server the user runs on that address, so they are
 * accepted only when the entry pins an explicit port.
 */
function isLocalHostname(hostname: string): boolean {
  return hostname === 'localhost' || IPV4_HOSTNAME.test(hostname);
}

/**
 * Split a `host[:port]` value. Returns null when the shape is unusable, including
 * a port outside 1–65535. The port is returned canonicalized (`:0080` → `80`) so
 * stored entries and live hosts compare as strings.
 */
function splitHostPort(value: string): CustomWebsiteHost | null {
  const match = /^([a-z0-9.-]+)(?::(\d+))?$/i.exec(value);
  if (!match) return null;

  const hostname = match[1];
  const rawPort = match[2];
  if (rawPort === undefined) return { hostname, port: null };

  const port = Number(rawPort);
  if (!Number.isInteger(port) || port < 1 || port > 65535) return null;
  return { hostname, port: String(port) };
}

/**
 * Reduce user input to the stored form: a bare registrable hostname, or a
 * `host:port` pair when the entry pins one. Loopback and IP hosts must pin a
 * port; everything else may.
 */
export function normalizeCustomWebsite(value: unknown): string | null {
  if (typeof value !== 'string') return null;

  let normalized = value.trim().toLowerCase();
  if (!normalized || BLOCKED_CUSTOM_WEBSITE_VALUES.has(normalized)) return null;
  if (normalized.includes('*')) return null;

  normalized = normalized
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/\/.*$/, '')
    .replace(/^\*\./, '');

  if (!normalized || BLOCKED_CUSTOM_WEBSITE_VALUES.has(normalized)) return null;

  const parts = splitHostPort(normalized);
  if (!parts) return null;

  const { hostname, port } = parts;
  if (isLocalHostname(hostname)) return port ? `${hostname}:${port}` : null;
  if (!REGISTRABLE_HOSTNAME.test(hostname)) return null;
  return port ? `${hostname}:${port}` : hostname;
}

export function sanitizeCustomWebsites(value: unknown): string[] {
  if (!Array.isArray(value)) return [];

  const seen = new Set<string>();
  const websites: string[] = [];
  for (const item of value) {
    const normalized = normalizeCustomWebsite(item);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    websites.push(normalized);
  }
  return websites;
}

/**
 * Whether any stored entry covers `host` (a `location.host`-shaped value, so it
 * may carry a port). A port-pinned entry matches that exact origin only; a bare
 * hostname entry keeps covering the host and its subdomains on any port.
 */
export function customWebsitesIncludeHost(value: unknown, host: string): boolean {
  const current = splitHostPort(
    host
      .trim()
      .toLowerCase()
      .replace(/^www\./, ''),
  );
  if (!current) return false;

  return sanitizeCustomWebsites(value).some((website) => {
    const entry = splitHostPort(website);
    if (!entry) return false;
    if (entry.port !== null) {
      return current.hostname === entry.hostname && current.port === entry.port;
    }
    return current.hostname === entry.hostname || current.hostname.endsWith(`.${entry.hostname}`);
  });
}

/**
 * Host permission patterns to request for a stored entry.
 *
 * Extension match patterns cannot carry a port, so a port-pinned entry still has
 * to be granted for the whole host — the port only narrows where the content
 * script actually runs. Loopback and IP hosts also cannot take the `*.`
 * subdomain wildcard.
 */
export function customWebsiteOriginPatterns(value: unknown): string[] | null {
  const normalized = normalizeCustomWebsite(value);
  if (!normalized) return null;

  const parts = splitHostPort(normalized);
  if (!parts) return null;

  const { hostname } = parts;
  if (isLocalHostname(hostname)) return [`http://${hostname}/*`, `https://${hostname}/*`];
  return [`https://*.${hostname}/*`, `http://*.${hostname}/*`];
}
