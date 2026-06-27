import * as fs from 'fs';
import * as http from 'http';
import * as os from 'os';
import * as path from 'path';

import { HOOK_API_PREFIX, SERVER_JSON_DIR, SERVER_JSON_NAME } from '../../../constants.js';
import type { ServerConfig } from '../../../server.js';

const SERVER_JSON = path.join(os.homedir(), SERVER_JSON_DIR, SERVER_JSON_NAME);

let debugLogPath = process.env['PIXEL_AGENTS_DEBUG_LOG'];
function hookDebug(line: string): void {
  if (!debugLogPath) return;
  try {
    fs.appendFileSync(debugLogPath, `${new Date().toISOString()} HOOKSCRIPT ${line}\n`);
  } catch {
    /* never let diagnostics break the hook */
  }
}

async function main(): Promise<void> {
  const providerId = process.argv[2]?.trim();
  if (!providerId || !/^[a-z0-9-]+$/.test(providerId)) {
    hookDebug('exit reason=bad-provider-id');
    process.exit(0);
  }

  let input = '';
  for await (const chunk of process.stdin) input += chunk;

  let data: Record<string, unknown>;
  try {
    data = JSON.parse(input);
  } catch {
    hookDebug('exit reason=bad-stdin');
    process.exit(0);
  }

  const eventName = (data.hook_event_name as string | undefined) ?? '?';
  const sid = (data.session_id as string | undefined)?.slice(0, 8) ?? '?';

  let server: ServerConfig;
  try {
    server = JSON.parse(fs.readFileSync(SERVER_JSON, 'utf-8'));
  } catch (e) {
    hookDebug(
      `exit reason=no-server-json event=${eventName} sid=${sid} path=${SERVER_JSON} err=${e instanceof Error ? e.message : String(e)}`,
    );
    process.exit(0);
  }

  if (!debugLogPath && server.debugLog) debugLogPath = server.debugLog;

  hookDebug(`POST provider=${providerId} event=${eventName} sid=${sid} port=${server.port}`);
  const body = JSON.stringify(data);
  return new Promise((resolve) => {
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port: server.port,
        path: `${HOOK_API_PREFIX}/${providerId}`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
          Authorization: `Bearer ${server.token}`,
        },
        timeout: 2000,
      },
      (res) => {
        hookDebug(
          `POST-done provider=${providerId} event=${eventName} sid=${sid} status=${res.statusCode}`,
        );
        res.resume();
        resolve();
      },
    );
    req.on('error', (err) => {
      hookDebug(
        `POST-error provider=${providerId} event=${eventName} sid=${sid} err=${err.message}`,
      );
      resolve();
    });
    req.on('timeout', () => {
      hookDebug(
        `POST-timeout provider=${providerId} event=${eventName} sid=${sid} port=${server.port}`,
      );
      req.destroy();
      resolve();
    });
    req.end(body);
  });
}

main()
  .catch(() => {})
  .finally(() => process.exit(0));
