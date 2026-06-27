import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { normalizeProjectPath } from '../../../../../core/src/normalizeProjectPath.js';
import type { HookProvider } from '../../../../../core/src/provider.js';
import {
  CLAUDE_COMPATIBLE_HOOK_EVENTS,
  normalizeClaudeCompatibleHookEvent,
} from '../shared/claudeCompatibleHooks.js';
import { formatCompatibleToolStatus } from '../shared/formatCompatibleToolStatus.js';
import {
  areHooksInstalled as installerAreHooksInstalled,
  installHooks as installerInstallHooks,
  uninstallHooks as installerUninstallHooks,
} from './codexHookInstaller.js';
import { CODEX_TERMINAL_NAME_PREFIX } from './constants.js';

function getCodexSessionsRoot(): string {
  return path.join(os.homedir(), '.codex', 'sessions');
}

function getSessionDirs(_workspacePath: string): string[] {
  const root = getCodexSessionsRoot();
  // Codex stores JSONL under ~/.codex/sessions/YYYY/MM/DD/. Hooks provide
  // transcript_path directly; this root enables external session discovery.
  return fs.existsSync(root) ? [root] : [root];
}

function getAllSessionRoots(): string[] {
  return [getCodexSessionsRoot()];
}

function buildLaunchCommand(
  _sessionId: string,
  cwd: string,
  _opts?: { bypassPermissions?: boolean },
): { command: string; args: string[]; env?: Record<string, string> } {
  return { command: 'codex', args: [], env: { PWD: cwd } };
}

/** Resolve nested session dirs for workspace-scoped scans (best-effort). */
function getWorkspaceSessionDirs(workspacePath: string): string[] {
  const normalized = normalizeProjectPath(workspacePath);
  const dirs: string[] = [];
  const sessionsRoot = getCodexSessionsRoot();
  if (!fs.existsSync(sessionsRoot)) return dirs;

  const walk = (dir: string, depth: number): void => {
    if (depth > 4) return;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name.includes(normalized) || normalized.includes(entry.name)) {
          dirs.push(full);
        }
        walk(full, depth + 1);
      }
    }
  };
  walk(sessionsRoot, 0);
  return dirs.length > 0 ? dirs : getSessionDirs(workspacePath);
}

export const codexProvider: HookProvider = {
  kind: 'hook',
  id: 'codex',
  displayName: 'OpenAI Codex CLI',
  protocolVersion: 1,

  normalizeHookEvent: normalizeClaudeCompatibleHookEvent,

  installHooks: async () => {
    installerInstallHooks();
  },
  uninstallHooks: async () => {
    installerUninstallHooks();
  },
  areHooksInstalled: async () => installerAreHooksInstalled(),

  formatToolStatus: formatCompatibleToolStatus,
  permissionExemptTools: new Set(['AskUserQuestion']),
  subagentToolNames: new Set(['Task', 'Agent']),
  readingTools: new Set([
    'Read',
    'read_file',
    'Grep',
    'grep',
    'Glob',
    'glob',
    'WebFetch',
    'WebSearch',
  ]),
  terminalNamePrefix: CODEX_TERMINAL_NAME_PREFIX,

  getSessionDirs: getWorkspaceSessionDirs,
  getAllSessionRoots,
  sessionFilePattern: '*.jsonl',
  buildLaunchCommand,
};

export { CLAUDE_COMPATIBLE_HOOK_EVENTS as CODEX_HOOK_EVENTS };
