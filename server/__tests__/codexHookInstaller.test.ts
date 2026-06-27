import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CODEX_HOOK_EVENTS } from '../src/providers/hook/codex/constants.js';
import { PIXEL_AGENTS_HOOK_SCRIPT_NAME } from '../src/providers/hook/shared/hookScriptConstants.js';

let tmpBase: string;

vi.mock('os', async () => {
  const actual = await vi.importActual<typeof import('os')>('os');
  return { ...actual, homedir: () => tmpBase };
});

const { areHooksInstalled, installHooks, uninstallHooks } =
  await import('../src/providers/hook/codex/codexHookInstaller.js');

function readHooksConfig(): Record<string, unknown> {
  const p = path.join(tmpBase, '.codex', 'hooks.json');
  return JSON.parse(fs.readFileSync(p, 'utf-8'));
}

describe('codexHookInstaller', () => {
  beforeEach(() => {
    tmpBase = fs.mkdtempSync(path.join(os.tmpdir(), 'pxl-codex-hook-'));
    fs.mkdirSync(path.join(tmpBase, '.codex'), { recursive: true });
  });

  afterEach(() => {
    try {
      fs.rmSync(tmpBase, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  });

  it('installs hooks for all codex events', () => {
    installHooks();
    const config = readHooksConfig();
    const hooks = config.hooks as Record<string, Array<{ hooks: Array<{ command: string }> }>>;
    for (const event of CODEX_HOOK_EVENTS) {
      expect(hooks[event]).toBeDefined();
      expect(
        hooks[event].some((entry) =>
          entry.hooks.some((h) => h.command.includes(PIXEL_AGENTS_HOOK_SCRIPT_NAME)),
        ),
      ).toBe(true);
      expect(
        hooks[event].some((entry) => entry.hooks.some((h) => h.command.includes(' codex'))),
      ).toBe(true);
    }
    expect(areHooksInstalled()).toBe(true);
  });

  it('uninstall removes pixel-agents codex entries', () => {
    installHooks();
    uninstallHooks();
    const config = readHooksConfig();
    expect(config.hooks ?? {}).toEqual({});
    expect(areHooksInstalled()).toBe(false);
  });
});
