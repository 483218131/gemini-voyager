import { afterEach, describe, expect, it, vi } from 'vitest';

import { FolderManager } from '../manager';
import type { FolderData } from '../types';

vi.mock('@/utils/i18n', () => ({
  getTranslationSync: (key: string) => key,
  getTranslationSyncUnsafe: (key: string) => key,
  initI18n: () => Promise.resolve(),
}));

type TestableManager = {
  data: FolderData;
  showMoveToFolderDialog: (conversationId: string, title: string, url: string) => void;
  addConversationToFolderFromNative: (
    folderId: string,
    conversationId: string,
    title: string,
    url: string,
  ) => void;
  destroy: () => void;
};

describe('move to folder dialog', () => {
  let manager: FolderManager | null = null;

  afterEach(() => {
    manager?.destroy();
    manager = null;
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  it('renders folder paths in a searchable tree list', () => {
    manager = new FolderManager();
    const typedManager = manager as unknown as TestableManager;
    typedManager.data = {
      folders: [
        {
          id: 'root-misc',
          name: 'misc',
          parentId: null,
          isExpanded: true,
          createdAt: 1,
          updatedAt: 1,
        },
        {
          id: 'software',
          name: 'software',
          parentId: null,
          isExpanded: true,
          createdAt: 2,
          updatedAt: 2,
        },
        {
          id: 'software-misc',
          name: 'misc',
          parentId: 'software',
          isExpanded: true,
          createdAt: 3,
          updatedAt: 3,
        },
      ],
      folderContents: {},
    };

    const addSpy = vi
      .spyOn(typedManager, 'addConversationToFolderFromNative')
      .mockImplementation(() => {});

    typedManager.showMoveToFolderDialog('conv-a', 'Conversation A', '/app/conv-a');

    const items = [...document.querySelectorAll<HTMLButtonElement>('.gv-folder-dialog-item')];
    expect(items.map((item) => item.dataset.folderPath)).toEqual([
      'misc',
      'software',
      'software / misc',
    ]);
    expect(
      items.map((item) => item.querySelector('.gv-folder-dialog-item-path')?.textContent),
    ).toEqual(['/misc', '/software', '/software/misc']);

    const search = document.querySelector<HTMLInputElement>('.gv-folder-dialog-search');
    expect(search).not.toBeNull();

    search!.value = 'missing';
    search!.dispatchEvent(new InputEvent('input', { bubbles: true }));

    const filteredItems = [
      ...document.querySelectorAll<HTMLButtonElement>('.gv-folder-dialog-item'),
    ];
    expect(filteredItems).toHaveLength(0);
    expect(document.querySelector('.gv-folder-dialog-empty')?.textContent).toBe(
      'timelinePreviewNoResults',
    );

    search!.value = 'software/misc';
    search!.dispatchEvent(new InputEvent('input', { bubbles: true }));

    const matchingItems = [
      ...document.querySelectorAll<HTMLButtonElement>('.gv-folder-dialog-item'),
    ];
    expect(matchingItems).toHaveLength(1);
    expect(matchingItems[0].dataset.folderPath).toBe('software / misc');

    matchingItems[0].click();

    expect(addSpy).toHaveBeenCalledWith(
      'software-misc',
      'conv-a',
      'Conversation A',
      '/app/conv-a',
      undefined,
      undefined,
    );
    expect(document.querySelector('.gv-folder-dialog-overlay')).toBeNull();
  });
});
