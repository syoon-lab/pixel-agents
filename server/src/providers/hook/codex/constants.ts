import { CLAUDE_COMPATIBLE_HOOK_EVENTS } from '../shared/claudeCompatibleHooks.js';
import { PIXEL_AGENTS_HOOK_SCRIPT_NAME } from '../shared/hookScriptConstants.js';

/** Output filename after esbuild compiles pixelAgentsHook.ts */
export const CODEX_HOOKS_CONFIG_PATH_SEGMENTS = ['.codex', 'hooks.json'] as const;

export const CODEX_TERMINAL_NAME_PREFIX = 'Codex';

export const CODEX_HOOK_EVENTS = CLAUDE_COMPATIBLE_HOOK_EVENTS;

export { PIXEL_AGENTS_HOOK_SCRIPT_NAME };
