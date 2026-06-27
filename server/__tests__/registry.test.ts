import { describe, expect, it } from 'vitest';

import type { HookProvider } from '../../core/src/provider.js';
import { claudeProvider } from '../src/providers/hook/claude/claude.js';
import { createProviderRegistry } from '../src/providers/loadProviders.js';
import { ProviderRegistry } from '../src/providers/registry.js';
import type { AgentState } from '../src/types.js';

function stubProvider(id: string): HookProvider {
  return {
    kind: 'hook',
    id,
    displayName: id,
    protocolVersion: 1,
    normalizeHookEvent: () => null,
    installHooks: async () => {},
    uninstallHooks: async () => {},
    areHooksInstalled: async () => false,
    formatToolStatus: (name) => name,
    permissionExemptTools: new Set(),
    subagentToolNames: new Set(),
    readingTools: new Set(),
  };
}

describe('ProviderRegistry', () => {
  it('registers and retrieves providers by id', () => {
    const registry = new ProviderRegistry();
    const stub = stubProvider('test');
    registry.register(stub);
    expect(registry.get('test')).toBe(stub);
    expect(registry.has('test')).toBe(true);
  });

  it('getDefault returns first enabled provider', () => {
    const registry = createProviderRegistry(['codex']);
    expect(registry.getDefault().id).toBe('codex');
  });

  it('defaults to codex when no enabled list is passed', () => {
    const registry = createProviderRegistry();
    expect(registry.getDefault().id).toBe('codex');
    expect(registry.getEnabledIds()).toEqual(['codex']);
  });

  it('setEnabledIds skips unknown providers', () => {
    const registry = createProviderRegistry();
    registry.setEnabledIds(['codex', 'nonexistent']);
    expect(registry.getEnabledIds()).toEqual(['codex']);
  });

  it('getForAgent uses agent.providerId when set', () => {
    const registry = new ProviderRegistry();
    registry.register(claudeProvider);
    registry.register(stubProvider('other'));
    registry.setEnabledIds(['claude', 'other']);

    const agent = { providerId: 'other' } as AgentState;
    expect(registry.getForAgent(agent).id).toBe('other');
  });
});
