import type { HookProvider } from '../../../core/src/provider.js';
import type { AgentState } from '../types.js';

/**
 * Registry of HookProvider implementations. Routes hook events and per-agent
 * lookups to the correct provider by id.
 */
export class ProviderRegistry {
  private readonly providers = new Map<string, HookProvider>();
  private enabledIds: string[] = ['codex'];

  /** Register a provider. Overwrites any existing provider with the same id. */
  register(provider: HookProvider): void {
    this.providers.set(provider.id, provider);
  }

  has(id: string): boolean {
    return this.providers.has(id);
  }

  get(id: string): HookProvider | undefined {
    return this.providers.get(id);
  }

  getOrThrow(id: string): HookProvider {
    const provider = this.providers.get(id);
    if (!provider) {
      throw new Error(`Unknown provider: ${id}`);
    }
    return provider;
  }

  /** Resolve the provider for an agent, falling back to the hook's providerId or default. */
  getForAgent(agent: AgentState, fallbackProviderId?: string): HookProvider {
    const id = agent.providerId ?? fallbackProviderId ?? this.enabledIds[0] ?? 'codex';
    return this.get(id) ?? this.getDefault();
  }

  /** First enabled provider, or codex if the enabled list is empty. */
  getDefault(): HookProvider {
    const id = this.enabledIds[0] ?? 'codex';
    return this.getOrThrow(id);
  }

  getEnabled(): HookProvider[] {
    return this.enabledIds.map((id) => this.getOrThrow(id));
  }

  getEnabledIds(): readonly string[] {
    return this.enabledIds;
  }

  /** Replace the enabled provider list. Unknown ids are skipped with a warning. */
  setEnabledIds(ids: string[]): void {
    const valid: string[] = [];
    for (const id of ids) {
      if (this.providers.has(id)) {
        valid.push(id);
      } else {
        console.warn(`[Pixel Agents] Unknown provider "${id}" in enabled list, skipping`);
      }
    }
    this.enabledIds = valid.length > 0 ? valid : ['codex'];
  }

  list(): HookProvider[] {
    return [...this.providers.values()];
  }
}
