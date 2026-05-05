import {
  type AccountPlatform,
  type AccountScope,
  type AccountScopeHints,
  accountIsolationService,
  buildScopedStorageKey,
  detectAccountContextFromDocument,
  detectAccountPlatformFromUrl,
} from '@/core/services/AccountIsolationService';
import { StorageKeys } from '@/core/types/common';

import type { FolderData } from '../folder/types';

interface FolderBackupStorage {
  loadData(key: string): Promise<FolderData | null>;
}

type IsIsolationEnabled = (options: {
  platform?: AccountPlatform;
  pageUrl?: string | null;
}) => Promise<boolean>;

type ResolveAccountScope = (hints?: AccountScopeHints) => Promise<AccountScope>;

export interface ResolveFolderBackupStorageKeyOptions {
  pageUrl: string;
  doc: Document;
  isIsolationEnabled?: IsIsolationEnabled;
  resolveAccountScope?: ResolveAccountScope;
}

export function getFolderBackupBaseStorageKey(pageUrl: string): string {
  return detectAccountPlatformFromUrl(pageUrl) === 'aistudio'
    ? StorageKeys.FOLDER_DATA_AISTUDIO
    : StorageKeys.FOLDER_DATA;
}

export async function resolveFolderBackupStorageKey({
  pageUrl,
  doc,
  isIsolationEnabled = (options) => accountIsolationService.isIsolationEnabled(options),
  resolveAccountScope = (hints) => accountIsolationService.resolveAccountScope(hints),
}: ResolveFolderBackupStorageKeyOptions): Promise<string> {
  const platform = detectAccountPlatformFromUrl(pageUrl);
  const baseKey = getFolderBackupBaseStorageKey(pageUrl);

  try {
    const enabled = await isIsolationEnabled({ platform, pageUrl });
    if (!enabled) return baseKey;

    const context = detectAccountContextFromDocument(pageUrl, doc);
    const scope = await resolveAccountScope({
      pageUrl,
      routeUserId: context.routeUserId,
      email: context.email,
    });
    return buildScopedStorageKey(baseKey, scope.accountKey);
  } catch (error) {
    console.warn('[PromptManager] Failed to resolve folder backup storage key:', error);
    return baseKey;
  }
}

export async function loadFolderDataForLocalBackup(
  storage: FolderBackupStorage,
  pageUrl: string,
  doc: Document,
  options: Partial<
    Pick<ResolveFolderBackupStorageKeyOptions, 'isIsolationEnabled' | 'resolveAccountScope'>
  > = {},
): Promise<FolderData> {
  const storageKey = await resolveFolderBackupStorageKey({
    pageUrl,
    doc,
    ...options,
  });

  return (
    (await storage.loadData(storageKey)) || {
      folders: [],
      folderContents: {},
    }
  );
}
