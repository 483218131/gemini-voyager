import { afterEach, describe, expect, it } from 'vitest';

import { PluginScope } from '@/features/plugins/runtime/pluginScope';

import { activateFormulaCopy, getFormulaCopyService } from './index';

describe('formula copy plugin lifecycle', () => {
  afterEach(() => {
    getFormulaCopyService().destroy();
  });

  it('initializes on activate and destroys on scope disposal', async () => {
    const scope = new PluginScope();
    activateFormulaCopy(scope);
    expect(getFormulaCopyService().isServiceInitialized()).toBe(true);

    await scope.dispose();
    expect(getFormulaCopyService().isServiceInitialized()).toBe(false);
  });
});
