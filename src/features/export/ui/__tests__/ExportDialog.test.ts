import { afterEach, describe, expect, it, vi } from 'vitest';

import { IMAGE_EXPORT_WIDTH_WIDE } from '../../types/export';
import { ExportDialog } from '../ExportDialog';

describe('ExportDialog', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    vi.useRealTimers();
  });

  it('does not autofocus the first (json) radio option', () => {
    vi.useFakeTimers();

    const dialog = new ExportDialog();
    dialog.show({
      onExport: () => {},
      onCancel: () => {},
      translations: {
        title: 'Export Chat',
        selectFormat: 'Select format',
        warning: 'Warning',
        safariCmdpHint: 'Safari tip',
        safariMarkdownHint: 'Safari markdown tip',
        cancel: 'Cancel',
        export: 'Export',
        fontSizeLabel: 'Font Size',
        fontSizePreview: 'The quick brown fox jumps over the lazy dog.',
        imageWidthLabel: 'Image Width',
        imageWidthNarrow: 'Narrow',
        imageWidthMedium: 'Medium',
        imageWidthWide: 'Wide',
        promptHeadingLabel: 'Use prompts as turn headings',
        promptHeadingHint: 'Put each prompt in its turn heading.',
        formatDescriptions: {
          json: 'JSON format',
          markdown: 'Markdown format',
          pdf: 'PDF format',
          image: 'Image format',
        },
      },
    });

    const firstRadio = document.querySelector(
      'input[name="export-format"][value="json"]',
    ) as HTMLInputElement | null;
    const wrapper = document.querySelector('.gv-export-dialog') as HTMLElement | null;
    expect(firstRadio).not.toBeNull();
    expect(wrapper).not.toBeNull();

    vi.advanceTimersByTime(120);

    expect(document.activeElement).toBe(wrapper);
    expect(document.activeElement).not.toBe(firstRadio);
    expect(
      (document.querySelector('.gv-export-prompt-heading-section') as HTMLElement | null)?.style
        .display,
    ).toBe('none');
  });

  it('does not render warning block when warning is empty', () => {
    const dialog = new ExportDialog();
    dialog.show({
      onExport: () => {},
      onCancel: () => {},
      translations: {
        title: 'Export',
        selectFormat: 'Select format',
        warning: '',
        safariCmdpHint: 'Safari tip',
        safariMarkdownHint: 'Safari markdown tip',
        cancel: 'Cancel',
        export: 'Export',
        fontSizeLabel: 'Font Size',
        fontSizePreview: 'The quick brown fox jumps over the lazy dog.',
        imageWidthLabel: 'Image Width',
        imageWidthNarrow: 'Narrow',
        imageWidthMedium: 'Medium',
        imageWidthWide: 'Wide',
        promptHeadingLabel: 'Use prompts as turn headings',
        promptHeadingHint: 'Put each prompt in its turn heading.',
        formatDescriptions: {
          json: 'JSON format',
          markdown: 'Markdown format',
          pdf: 'PDF format',
          image: 'Image format',
        },
      },
    });

    const warning = document.querySelector('.gv-export-dialog-warning') as HTMLElement | null;
    expect(warning).toBeNull();
  });

  it('uses the provided initial image width when exporting an image', () => {
    const onExport = vi.fn();
    const dialog = new ExportDialog();
    dialog.show({
      onExport,
      onCancel: () => {},
      initialImageWidth: IMAGE_EXPORT_WIDTH_WIDE,
      translations: {
        title: 'Export',
        selectFormat: 'Select format',
        warning: '',
        safariCmdpHint: 'Safari tip',
        safariMarkdownHint: 'Safari markdown tip',
        cancel: 'Cancel',
        export: 'Export',
        fontSizeLabel: 'Font Size',
        fontSizePreview: 'The quick brown fox jumps over the lazy dog.',
        imageWidthLabel: 'Image Width',
        imageWidthNarrow: 'Narrow',
        imageWidthMedium: 'Medium',
        imageWidthWide: 'Wide',
        promptHeadingLabel: 'Use prompts as turn headings',
        promptHeadingHint: 'Put each prompt in its turn heading.',
        formatDescriptions: {
          json: 'JSON format',
          markdown: 'Markdown format',
          pdf: 'PDF format',
          image: 'Image format',
        },
      },
    });

    const imageRadio = document.querySelector(
      'input[name="export-format"][value="image"]',
    ) as HTMLInputElement | null;
    if (imageRadio) {
      imageRadio.checked = true;
    }
    imageRadio?.dispatchEvent(new Event('change', { bubbles: true }));

    const activeWidth = document.querySelector(
      '.gv-export-width-btn.active',
    ) as HTMLButtonElement | null;
    expect(activeWidth?.textContent).toBe('Wide');

    const exportButton = document.querySelector(
      '.gv-export-dialog-btn-primary',
    ) as HTMLButtonElement | null;
    exportButton?.click();

    expect(onExport).toHaveBeenCalledWith('image', 20, IMAGE_EXPORT_WIDTH_WIDE, undefined);
  });

  it('offers prompt headings for Markdown exports when enabled', () => {
    const onExport = vi.fn();
    const dialog = new ExportDialog();
    dialog.show({
      onExport,
      onCancel: () => {},
      showPromptHeadingOption: true,
      translations: {
        title: 'Export',
        selectFormat: 'Select format',
        warning: '',
        safariCmdpHint: 'Safari tip',
        safariMarkdownHint: 'Safari markdown tip',
        cancel: 'Cancel',
        export: 'Export',
        fontSizeLabel: 'Font Size',
        fontSizePreview: 'The quick brown fox jumps over the lazy dog.',
        imageWidthLabel: 'Image Width',
        imageWidthNarrow: 'Narrow',
        imageWidthMedium: 'Medium',
        imageWidthWide: 'Wide',
        promptHeadingLabel: 'Use prompts as turn headings',
        promptHeadingHint: 'Put each prompt in its turn heading.',
        formatDescriptions: {
          json: 'JSON format',
          markdown: 'Markdown format',
          pdf: 'PDF format',
          image: 'Image format',
        },
      },
    });

    const section = document.querySelector(
      '.gv-export-prompt-heading-section',
    ) as HTMLElement | null;
    const toggle = section?.querySelector('[role="switch"]') as HTMLButtonElement | null;
    expect(section?.style.display).toBe('flex');
    expect(toggle?.getAttribute('aria-checked')).toBe('false');

    toggle?.click();
    expect(toggle?.getAttribute('aria-checked')).toBe('true');

    const exportButton = document.querySelector(
      '.gv-export-dialog-btn-primary',
    ) as HTMLButtonElement | null;
    exportButton?.click();

    expect(onExport).toHaveBeenCalledWith('markdown', undefined, undefined, true);
  });

  it('hides the prompt heading switch for non-Markdown formats', () => {
    const dialog = new ExportDialog();
    dialog.show({
      onExport: () => {},
      onCancel: () => {},
      showPromptHeadingOption: true,
      translations: {
        title: 'Export',
        selectFormat: 'Select format',
        warning: '',
        safariCmdpHint: 'Safari tip',
        safariMarkdownHint: 'Safari markdown tip',
        cancel: 'Cancel',
        export: 'Export',
        fontSizeLabel: 'Font Size',
        fontSizePreview: 'The quick brown fox jumps over the lazy dog.',
        imageWidthLabel: 'Image Width',
        imageWidthNarrow: 'Narrow',
        imageWidthMedium: 'Medium',
        imageWidthWide: 'Wide',
        promptHeadingLabel: 'Use prompts as turn headings',
        promptHeadingHint: 'Put each prompt in its turn heading.',
        formatDescriptions: {
          json: 'JSON format',
          markdown: 'Markdown format',
          pdf: 'PDF format',
          image: 'Image format',
        },
      },
    });

    const jsonRadio = document.querySelector(
      'input[name="export-format"][value="json"]',
    ) as HTMLInputElement | null;
    if (jsonRadio) jsonRadio.checked = true;
    jsonRadio?.dispatchEvent(new Event('change', { bubbles: true }));

    const section = document.querySelector(
      '.gv-export-prompt-heading-section',
    ) as HTMLElement | null;
    expect(section?.style.display).toBe('none');
  });
});
