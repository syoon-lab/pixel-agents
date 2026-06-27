import { describe, expect, it } from 'vitest';

import { codexProvider } from '../src/providers/hook/codex/codex.js';

describe('codexProvider', () => {
  it('has expected identity', () => {
    expect(codexProvider.kind).toBe('hook');
    expect(codexProvider.id).toBe('codex');
    expect(codexProvider.displayName).toBe('OpenAI Codex CLI');
    expect(codexProvider.protocolVersion).toBe(1);
  });

  it('normalizes Claude-compatible hook events', () => {
    const result = codexProvider.normalizeHookEvent({
      hook_event_name: 'PreToolUse',
      session_id: 'sess-1',
      tool_name: 'read_file',
      tool_input: { path: '/tmp/foo.ts' },
    });
    expect(result?.sessionId).toBe('sess-1');
    expect(result?.event.kind).toBe('toolStart');
    if (result?.event.kind === 'toolStart') {
      expect(result.event.toolName).toBe('read_file');
    }
  });

  it('formats codex tool names', () => {
    expect(codexProvider.formatToolStatus('read_file', { path: '/a/b.ts' })).toBe('Reading b.ts');
    expect(codexProvider.formatToolStatus('bash', { command: 'npm test' })).toBe(
      'Running: npm test',
    );
  });

  it('exposes session roots under ~/.codex/sessions', () => {
    const roots = codexProvider.getAllSessionRoots?.();
    expect(roots?.[0]).toContain('.codex');
    expect(roots?.[0]).toContain('sessions');
  });

  it('buildLaunchCommand runs codex in cwd', () => {
    const launch = codexProvider.buildLaunchCommand?.('sid', '/proj');
    expect(launch?.command).toBe('codex');
    expect(launch?.env?.PWD).toBe('/proj');
  });
});
