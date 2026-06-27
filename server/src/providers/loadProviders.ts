import { claudeProvider } from './hook/claude/claude.js';
import { codexProvider } from './hook/codex/codex.js';
import {
  loadProvidersConfig,
  orderEnabledIds,
  resolveEnabledProviderIds,
} from './providerConfig.js';
import { ProviderRegistry } from './registry.js';

export interface CreateProviderRegistryOptions {
  /** CLI `--providers` override */
  enabledIds?: string[];
}

/**
 * Create a ProviderRegistry with all bundled providers registered.
 * Enabled list: CLI flag > ~/.pixel-agents/providers.json > ['codex'].
 */
export function createProviderRegistry(
  options?: CreateProviderRegistryOptions | string[],
): ProviderRegistry {
  const cliOverride = Array.isArray(options) ? options : options?.enabledIds;
  const config = loadProvidersConfig();
  const enabledIds = resolveEnabledProviderIds(config, cliOverride);
  const ordered = orderEnabledIds(config, enabledIds);

  const registry = new ProviderRegistry();
  registry.register(claudeProvider);
  registry.register(codexProvider);
  registry.setEnabledIds(ordered);

  return registry;
}
