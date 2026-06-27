import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import type { HookProvider } from '../../../core/src/provider.js';
import { LAYOUT_FILE_DIR } from '../constants.js';
import type { ProviderRegistry } from './registry.js';

export interface ProvidersConfig {
  /** Provider used when no agent.providerId is set. Default: codex */
  defaultProvider?: string;
  /** Enabled provider ids. Default: ['codex'] */
  enabled?: string[];
}

const PROVIDERS_FILE_NAME = 'providers.json';

function getProvidersConfigPath(): string {
  return path.join(os.homedir(), LAYOUT_FILE_DIR, PROVIDERS_FILE_NAME);
}

export function loadProvidersConfig(): ProvidersConfig {
  const configPath = getProvidersConfigPath();
  try {
    if (fs.existsSync(configPath)) {
      const raw = JSON.parse(fs.readFileSync(configPath, 'utf-8')) as ProvidersConfig;
      return {
        defaultProvider:
          typeof raw.defaultProvider === 'string' ? raw.defaultProvider : undefined,
        enabled: Array.isArray(raw.enabled)
          ? raw.enabled.filter((id) => typeof id === 'string')
          : undefined,
      };
    }
  } catch (e) {
    console.warn(`[Pixel Agents] Failed to read ${configPath}: ${e}`);
  }
  return {};
}

export function resolveEnabledProviderIds(
  config: ProvidersConfig,
  cliOverride?: string[],
): string[] {
  if (cliOverride && cliOverride.length > 0) return cliOverride;
  if (config.enabled && config.enabled.length > 0) return [...config.enabled];
  return ['codex'];
}

export function orderEnabledIds(config: ProvidersConfig, enabledIds: string[]): string[] {
  const defaultId = config.defaultProvider ?? enabledIds[0] ?? 'codex';
  const rest = enabledIds.filter((id) => id !== defaultId);
  return [defaultId, ...rest];
}

export function mergeProviderCapabilities(registry: ProviderRegistry): {
  readingTools: string[];
  subagentToolNames: string[];
} {
  const readingTools = new Set<string>();
  const subagentToolNames = new Set<string>();
  for (const provider of registry.getEnabled()) {
    for (const tool of provider.readingTools) readingTools.add(tool);
    for (const tool of provider.subagentToolNames) subagentToolNames.add(tool);
  }
  return {
    readingTools: [...readingTools],
    subagentToolNames: [...subagentToolNames],
  };
}

export async function installHooksForProvider(
  provider: HookProvider,
  _serverUrl: string,
  _authToken: string,
): Promise<void> {
  await provider.installHooks(_serverUrl, _authToken);
}

export async function uninstallHooksForProvider(provider: HookProvider): Promise<void> {
  await provider.uninstallHooks();
}
