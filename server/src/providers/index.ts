/**
 * Provider registry: re-exports all bundled providers.
 *
 * Adding a new CLI provider:
 *   1. Create `server/src/providers/hook/<cli>/<cli>.ts` implementing HookProvider.
 *   2. Register it in `loadProviders.ts`.
 *   3. Add an export line below.
 */

export { claudeProvider } from './hook/claude/claude.js';
export { codexProvider } from './hook/codex/codex.js';
export { copyHookScript } from './hook/shared/jsonHooksInstaller.js';
export { copyPixelAgentsHookScript } from './hook/shared/jsonHooksInstaller.js';
export { installEnabledProviderHooks, uninstallEnabledProviderHooks } from './hookInstall.js';
export { createProviderRegistry } from './loadProviders.js';
export { loadProvidersConfig, mergeProviderCapabilities } from './providerConfig.js';
export { ProviderRegistry } from './registry.js';
