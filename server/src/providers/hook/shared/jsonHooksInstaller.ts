import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { HOOK_SCRIPTS_DIR } from '../../../constants.js';
import { PIXEL_AGENTS_HOOK_SCRIPT_NAME } from './hookScriptConstants.js';

export interface HookHandlerEntry {
  type: string;
  command: string;
  timeout?: number;
}

export interface HookMatcherGroup {
  matcher?: string;
  hooks: HookHandlerEntry[];
}

export interface JsonHooksConfigFile {
  hooks?: Record<string, HookMatcherGroup[]>;
  [key: string]: unknown;
}

const LEGACY_HOOK_MARKERS = ['pixel-agents-hook.js', 'claude-hook.js'];

export function getPixelAgentsHookScriptPath(): string {
  return path.join(os.homedir(), HOOK_SCRIPTS_DIR, PIXEL_AGENTS_HOOK_SCRIPT_NAME);
}

export function makePixelAgentsHookCommand(providerId: string): string {
  const scriptPath = getPixelAgentsHookScriptPath();
  return `node "${scriptPath}" ${providerId}`;
}

function readConfigFile(configPath: string): JsonHooksConfigFile {
  try {
    if (fs.existsSync(configPath)) {
      return JSON.parse(fs.readFileSync(configPath, 'utf-8')) as JsonHooksConfigFile;
    }
  } catch (e) {
    console.error(`[Pixel Agents] Failed to read hooks config at ${configPath}: ${e}`);
  }
  return {};
}

function writeConfigFile(configPath: string, data: JsonHooksConfigFile): void {
  const dir = path.dirname(configPath);
  try {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    const tmpPath = configPath + '.pixel-agents-tmp';
    fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2), 'utf-8');
    fs.renameSync(tmpPath, configPath);
  } catch (e) {
    console.error(`[Pixel Agents] Failed to write hooks config at ${configPath}: ${e}`);
  }
}

function isOurHookEntry(entry: HookMatcherGroup, providerId: string): boolean {
  const marker = `${PIXEL_AGENTS_HOOK_SCRIPT_NAME} ${providerId}`;
  return entry.hooks.some(
    (h) =>
      h.command.includes(marker) ||
      LEGACY_HOOK_MARKERS.some((legacy) => h.command.includes(legacy)),
  );
}

function makeHookEntry(providerId: string): HookMatcherGroup {
  return {
    matcher: '',
    hooks: [
      {
        type: 'command',
        command: makePixelAgentsHookCommand(providerId),
        timeout: 5,
      },
    ],
  };
}

export function arePixelAgentsHooksInstalled(
  configPath: string,
  providerId: string,
  hookEvents: readonly string[],
): boolean {
  const config = readConfigFile(configPath);
  if (!config.hooks) return false;
  return hookEvents.every((event) => {
    const entries = config.hooks?.[event];
    return Array.isArray(entries) && entries.some((e) => isOurHookEntry(e, providerId));
  });
}

export function installPixelAgentsHooks(
  configPath: string,
  providerId: string,
  hookEvents: readonly string[],
): void {
  const config = readConfigFile(configPath);
  if (!config.hooks) {
    config.hooks = {};
  }

  let changed = false;
  for (const event of hookEvents) {
    if (!Array.isArray(config.hooks[event])) {
      config.hooks[event] = [];
    }
    const entries = config.hooks[event];
    const filtered = entries.filter((e) => !isOurHookEntry(e, providerId));
    filtered.push(makeHookEntry(providerId));
    if (JSON.stringify(filtered) !== JSON.stringify(entries)) {
      config.hooks[event] = filtered;
      changed = true;
    }
  }

  if (changed) {
    writeConfigFile(configPath, config);
    console.log(`[Pixel Agents] Hooks installed for "${providerId}" at ${configPath}`);
  }
}

export function uninstallPixelAgentsHooks(configPath: string, providerId: string): void {
  const config = readConfigFile(configPath);
  if (!config.hooks) return;

  let changed = false;
  for (const event of Object.keys(config.hooks)) {
    const entries = config.hooks[event];
    if (!Array.isArray(entries)) continue;
    const filtered = entries.filter((e) => !isOurHookEntry(e, providerId));
    if (filtered.length !== entries.length) {
      config.hooks[event] = filtered;
      changed = true;
    }
    if (config.hooks[event].length === 0) {
      delete config.hooks[event];
    }
  }
  if (Object.keys(config.hooks).length === 0) {
    delete config.hooks;
  }

  if (changed) {
    writeConfigFile(configPath, config);
    console.log(`[Pixel Agents] Hooks removed for "${providerId}" from ${configPath}`);
  }
}

function resolveHookScriptSource(bundleRoot: string): string {
  const besideCli = path.join(bundleRoot, 'hooks', PIXEL_AGENTS_HOOK_SCRIPT_NAME);
  if (fs.existsSync(besideCli)) return besideCli;
  return path.join(bundleRoot, 'dist', 'hooks', PIXEL_AGENTS_HOOK_SCRIPT_NAME);
}

export function copyPixelAgentsHookScript(bundleRoot: string): void {
  const src = resolveHookScriptSource(bundleRoot);
  const dst = getPixelAgentsHookScriptPath();
  const dstDir = path.dirname(dst);

  try {
    if (!fs.existsSync(dstDir)) {
      fs.mkdirSync(dstDir, { recursive: true, mode: 0o700 });
    }
    if (!fs.existsSync(src)) {
      console.warn(`[Pixel Agents] Hook script not found at ${src}`);
      return;
    }
    fs.copyFileSync(src, dst);
    fs.chmodSync(dst, 0o700);
    console.log(`[Pixel Agents] Hook script installed at ${dst}`);
  } catch (e) {
    console.error(`[Pixel Agents] Failed to copy hook script: ${e}`);
  }
}

/** @deprecated Use copyPixelAgentsHookScript — kept for CLI / adapter call sites. */
export const copyHookScript = copyPixelAgentsHookScript;
