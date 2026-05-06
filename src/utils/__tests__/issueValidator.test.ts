import { createRequire } from 'node:module';
import { describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const {
  UNSUPPORTED_DEFAULT_VERSION_COMMENT,
  extractExtensionVersion,
  generateIssueTitle,
  normalizeSubmittedVersion,
  usesUnsupportedDefaultVersion,
  validateIssue,
} = require('../../../scripts/issue-validator.cjs') as {
  UNSUPPORTED_DEFAULT_VERSION_COMMENT: string;
  extractExtensionVersion: (body: string) => string;
  generateIssueTitle: (title: string, body: string) => string;
  normalizeSubmittedVersion: (version: string) => string;
  usesUnsupportedDefaultVersion: (body: string) => boolean;
  validateIssue: (args: {
    github: {
      rest: {
        issues: {
          addLabels: ReturnType<typeof vi.fn>;
          createComment: ReturnType<typeof vi.fn>;
          update: ReturnType<typeof vi.fn>;
        };
      };
    };
    context: {
      payload: { issue: { body: string; number: number; title: string } };
      repo: { owner: string; repo: string };
    };
  }) => Promise<void>;
};

const bodyWithVersion = (version: string): string => `### ⚠️ 前置检查 | Essential Checklist

- [x] 我确认使用的是插件的最新版本 / I am using the latest version of the extension

### 📦 扩展版本 | Extension Version

${version}

### 🐛 问题描述 | Bug Description

时间戳重复显示`;

describe('issue validator', () => {
  it('extracts and normalizes extension versions from issue form bodies', () => {
    const body = bodyWithVersion('`v1.1.3`');

    expect(extractExtensionVersion(body)).toBe('`v1.1.3`');
    expect(normalizeSubmittedVersion(extractExtensionVersion(body))).toBe('1.1.3');
    expect(usesUnsupportedDefaultVersion(body)).toBe(true);
  });

  it('does not warn for supported versions', () => {
    expect(usesUnsupportedDefaultVersion(bodyWithVersion('1.4.3'))).toBe(false);
  });

  it('keeps empty-title generation behavior', () => {
    expect(generateIssueTitle('[Bug]', bodyWithVersion('1.4.3'))).toBe('[Bug] 时间戳重复显示');
  });

  it('comments when an issue uses the unsupported template version', async () => {
    const createComment = vi.fn().mockResolvedValue({});
    const github = {
      rest: {
        issues: {
          addLabels: vi.fn().mockResolvedValue({}),
          createComment,
          update: vi.fn().mockResolvedValue({}),
        },
      },
    };

    await validateIssue({
      github,
      context: {
        payload: {
          issue: { body: bodyWithVersion('1.1.3'), number: 645, title: '[Bug] real title' },
        },
        repo: { owner: 'Nagi-ovo', repo: 'gemini-voyager' },
      },
    });

    expect(createComment).toHaveBeenCalledWith({
      owner: 'Nagi-ovo',
      repo: 'gemini-voyager',
      issue_number: 645,
      body: UNSUPPORTED_DEFAULT_VERSION_COMMENT,
    });
  });
});
