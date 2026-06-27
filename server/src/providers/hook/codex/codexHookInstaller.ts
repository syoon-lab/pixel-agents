import * as os from 'os';
import * as path from 'path';

import {
  arePixelAgentsHooksInstalled,
  installPixelAgentsHooks,
  uninstallPixelAgentsHooks,
} from '../shared/jsonHooksInstaller.js';
import { CODEX_HOOK_EVENTS, CODEX_HOOKS_CONFIG_PATH_SEGMENTS } from './constants.js';

function getCodexHooksConfigPath(): string {
  return path.join(os.homedir(), ...CODEX_HOOKS_CONFIG_PATH_SEGMENTS);
}

export function areHooksInstalled(): boolean {
  return arePixelAgentsHooksInstalled(getCodexHooksConfigPath(), 'codex', CODEX_HOOK_EVENTS);
}

export function installHooks(): void {
  installPixelAgentsHooks(getCodexHooksConfigPath(), 'codex', CODEX_HOOK_EVENTS);
}

export function uninstallHooks(): void {
  uninstallPixelAgentsHooks(getCodexHooksConfigPath(), 'codex');
}
