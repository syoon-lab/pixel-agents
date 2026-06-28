import * as path from 'path';
import { fileURLToPath } from 'url';

import { runAgent } from './agent.js';
import { AGENTS } from './config.js';
import { errLog, sysLog } from './logger.js';
import { OfficeClient, readServerInfo, stableSessionId } from './office.js';

/**
 * 진입점: 설정을 읽고, 픽셀 오피스 서버에 붙은 뒤, N명의 에이전트를 동시에 구동한다.
 * 각 에이전트는 OpenRouter로 자기 업무를 단계로 분해해 수행하고, 그 행동이 오피스에 보인다.
 */

// .env 자동 로드 (Node 20.6+). 키는 환경변수로도 줄 수 있다.
try {
  const here = path.dirname(fileURLToPath(import.meta.url));
  (process as NodeJS.Process & { loadEnvFile?: (p: string) => void }).loadEnvFile?.(
    path.join(here, '..', '.env'),
  );
} catch {
  /* .env 없으면 환경변수만 사용 */
}

function resolveWorkspace(): string {
  if (process.env.PIXEL_AGENTS_WORKSPACE) {
    return path.resolve(process.env.PIXEL_AGENTS_WORKSPACE);
  }
  // 기본값: repo 루트(이 파일 기준 ../..). cwd와 무관하게 결정되고, macOS의
  // NFC/NFD 차이도 서버가 repo 루트에서 process.cwd()로 잡는 값과 같은 정규화로
  // 맞춰진다(둘 다 파일시스템이 준 문자열). 서버를 다른 폴더에서 띄웠다면 env로 override.
  const here = path.dirname(fileURLToPath(import.meta.url)); // driver/src
  return path.resolve(here, '..', '..');
}

async function main(): Promise<void> {
  const apiKey = process.env.OPENROUTER_API_KEY?.trim();
  if (!apiKey) {
    errLog('OPENROUTER_API_KEY가 없습니다. driver/.env 에 넣거나 환경변수로 export 하세요.');
    process.exit(1);
  }

  let office: OfficeClient;
  try {
    const server = readServerInfo();
    office = new OfficeClient(server, resolveWorkspace());
  } catch (e) {
    errLog(
      `픽셀 오피스 서버를 찾지 못했습니다 (${e instanceof Error ? e.message : String(e)}).\n` +
        '  먼저 다른 터미널에서 서버를 띄우세요:  node dist/cli.js --providers claude\n' +
        '  (개발 중이면 repo 루트에서 npm run build 후 위 명령)',
    );
    process.exit(1);
  }

  sysLog(`서버 연결됨. 워크스페이스: ${office.workspace}`);
  sysLog(`채택 대상 디렉터리: ${office.projectDir}`);
  sysLog(
    `에이전트 ${AGENTS.length}명 출근 시작 — ${AGENTS.map((a) => a.name).join(', ')}\n` +
      '  (브라우저에서 캐릭터가 안 보이면 Settings에서 "Watch All Sessions"를 켜보세요)',
  );

  // 모든 에이전트를 동시에 구동. 각자 독립 루프.
  // sessionId는 workspace+이름 기반 "고정값" → 재실행 시 같은 캐릭터가 다시 일한다(누적 방지).
  const sessions = AGENTS.map((def) => ({
    def,
    sessionId: stableSessionId(`${office.workspace}::${def.name}`),
  }));
  await Promise.all(sessions.map((s) => runAgent(s.def, office, apiKey, s.sessionId)));

  sysLog('모든 에이전트가 한 번의 업무 분해 실행을 마쳤습니다. 캐릭터는 오피스에 남습니다.');
  sysLog('종료하려면 Ctrl+C. (Ctrl+C 시 캐릭터도 함께 퇴장)');

  // 캐릭터를 남겨두기 위해 프로세스를 살려 둔다. Ctrl+C로 정리 후 퇴장.
  const cleanup = () => {
    sysLog('정리 중...');
    void Promise.all(
      sessions.map(async ({ sessionId }) => {
        if (sessionId) await office.sessionEnd(sessionId);
      }),
    ).finally(() => process.exit(0));
  };
  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);
  await new Promise(() => {}); // keep alive
}

main().catch((e) => {
  errLog(e instanceof Error ? (e.stack ?? e.message) : String(e));
  process.exit(1);
});
