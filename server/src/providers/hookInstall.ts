import { copyHookScript as copyClaudeHookScript } from './hook/claude/claudeHookInstaller.js';
import { copyPixelAgentsHookScript } from './hook/shared/jsonHooksInstaller.js';
import { installHooksForProvider, uninstallHooksForProvider } from './providerConfig.js';
import type { ProviderRegistry } from './registry.js';

export async function installEnabledProviderHooks(
  registry: ProviderRegistry,
  serverUrl: string,
  authToken: string,
  bundleRoot: string,
): Promise<void> {
  copyPixelAgentsHookScript(bundleRoot);
  if (registry.getEnabledIds().includes('claude')) {
    copyClaudeHookScript(bundleRoot);
  }
  for (const provider of registry.getEnabled()) {
    await installHooksForProvider(provider, serverUrl, authToken);
  }
}

export async function uninstallEnabledProviderHooks(registry: ProviderRegistry): Promise<void> {
  for (const provider of registry.getEnabled()) {
    await uninstallHooksForProvider(provider);
  }
}

export { copyPixelAgentsHookScript };
