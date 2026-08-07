// Convenience function for backward compatibility
import type { PluginScope } from '@/features/plugins/runtime/pluginScope';

import { getFormulaCopyService } from './FormulaCopyService';

/**
 * Formula Copy Feature Entry Point
 * Exports the service and provides a simple initialization function
 */

export { FormulaCopyService, getFormulaCopyService } from './FormulaCopyService';
export type { FormulaCopyConfig } from './FormulaCopyService';

/** Direct entry point for the Gemini core feature lifecycle. */
export function startFormulaCopy(): void {
  const service = getFormulaCopyService();
  service.initialize();
}

export function stopFormulaCopy(): void {
  const service = getFormulaCopyService();
  service.destroy();
}

/**
 * Native lifecycle for the voyager.formula-copy builtin plugin
 * (Claude/ChatGPT). Gemini keeps the direct start/stop path above — the two
 * never overlap because the plugin's `matches` exclude Gemini hosts.
 */
export function activateFormulaCopy(scope: PluginScope): void {
  scope.effect(() => {
    const service = getFormulaCopyService();
    service.initialize();
    return () => service.destroy();
  }, 'formula-copy');
}
