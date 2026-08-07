import { describe, expect, it } from 'vitest';

import {
  customWebsiteOriginPatterns,
  customWebsitesIncludeHost,
  normalizeCustomWebsite,
  sanitizeCustomWebsites,
} from '../customWebsites';

describe('custom website normalization', () => {
  it('drops all-url sentinels and match patterns from persisted custom sites', () => {
    expect(
      sanitizeCustomWebsites([
        'all_urls',
        'all urls',
        '<all_urls>',
        '*://*/*',
        'https://*.example.com/*',
        'https://www.DeepSeek.com/',
        'deepseek.com',
        'qwen.ai/path',
      ]),
    ).toEqual(['deepseek.com', 'qwen.ai']);
  });

  it('normalizes only concrete hostnames', () => {
    expect(normalizeCustomWebsite('https://www.example.com/path')).toBe('example.com');
    expect(normalizeCustomWebsite('all_urls')).toBeNull();
    expect(normalizeCustomWebsite('all urls')).toBeNull();
    expect(normalizeCustomWebsite('<all_urls>')).toBeNull();
    expect(normalizeCustomWebsite('localhost')).toBeNull();
  });

  it('matches sanitized custom sites against the current host', () => {
    expect(customWebsitesIncludeHost(['all_urls', 'example.com'], 'chat.example.com')).toBe(true);
    expect(customWebsitesIncludeHost(['all_urls'], 'claude.ai')).toBe(false);
  });
});

describe('port-pinned custom websites', () => {
  it('accepts a port on any host, and requires one for loopback and IP hosts', () => {
    expect(normalizeCustomWebsite('http://localhost:3000/')).toBe('localhost:3000');
    expect(normalizeCustomWebsite('127.0.0.1:8080')).toBe('127.0.0.1:8080');
    expect(normalizeCustomWebsite('example.com:8443')).toBe('example.com:8443');
    expect(normalizeCustomWebsite('localhost:0080')).toBe('localhost:80');

    expect(normalizeCustomWebsite('127.0.0.1')).toBeNull();
    expect(normalizeCustomWebsite('localhost:0')).toBeNull();
    expect(normalizeCustomWebsite('localhost:70000')).toBeNull();
    expect(normalizeCustomWebsite('localhost:abc')).toBeNull();
  });

  it('confines a port-pinned entry to that exact origin', () => {
    expect(customWebsitesIncludeHost(['localhost:3000'], 'localhost:3000')).toBe(true);
    expect(customWebsitesIncludeHost(['localhost:3000'], 'localhost:5173')).toBe(false);
    expect(customWebsitesIncludeHost(['localhost:3000'], 'localhost')).toBe(false);
    expect(customWebsitesIncludeHost(['localhost:3000'], 'sub.localhost:3000')).toBe(false);
  });

  it('keeps bare hostname entries covering subdomains on any port', () => {
    expect(customWebsitesIncludeHost(['example.com'], 'chat.example.com:8443')).toBe(true);
    expect(customWebsitesIncludeHost(['example.com'], 'example.com')).toBe(true);
  });

  it('drops the port from host permission patterns and skips the wildcard locally', () => {
    expect(customWebsiteOriginPatterns('localhost:3000')).toEqual([
      'http://localhost/*',
      'https://localhost/*',
    ]);
    expect(customWebsiteOriginPatterns('example.com:8443')).toEqual([
      'https://*.example.com/*',
      'http://*.example.com/*',
    ]);
    expect(customWebsiteOriginPatterns('all_urls')).toBeNull();
  });
});
