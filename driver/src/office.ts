import { createHash } from 'crypto';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import type { ServerInfo } from './types.js';

/**
 * 에이전트마다 "고정" 세션 ID를 만든다 (workspace + 이름 해시 → UUID 형식).
 * 매 실행마다 랜덤 ID를 쓰면 캐릭터가 매번 새로 생겨 이전 캐릭터들이 Idle로 쌓인다.
 * 고정 ID면 다시 실행해도 같은 캐릭터가 다시 일하게 된다(세션 재사용).
 */
export function stableSessionId(seed: string): string {
  const h = createHash('sha1').update(seed).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
}

/**
 * 픽셀 오피스 서버 연동 (서버 코드는 import하지 않는다 — 외형만 흉내).
 *
 * - ~/.pixel-agents/server.json 에서 포트/토큰을 읽고
 * - Claude 호환 훅 페이로드를 POST /api/hooks/claude 로 보내며
 * - 캐릭터 채택용 최소 JSONL 트랜스크립트를 ~/.claude/projects/<hash>/ 에 쓴다.
 *
 * 검증된 형식이라 서버를 한 줄도 고치지 않는다 (PLAN_ref.md 1단계).
 */

const SERVER_JSON = path.join(os.homedir(), '.pixel-agents', 'server.json');
const HOOK_PATH = '/api/hooks/claude';

/** core/src/normalizeProjectPath.ts 와 동일 규칙. 서버와 같은 프로젝트 폴더를 가리키도록 복제. */
function normalizeProjectPath(absPath: string): string {
  return absPath.replace(/[^a-zA-Z0-9-]/g, '-');
}

export function readServerInfo(): ServerInfo {
  const raw = fs.readFileSync(SERVER_JSON, 'utf-8');
  const parsed = JSON.parse(raw) as Partial<ServerInfo>;
  if (typeof parsed.port !== 'number' || typeof parsed.token !== 'string') {
    throw new Error('server.json 형식이 올바르지 않습니다 (port/token 누락).');
  }
  return { port: parsed.port, token: parsed.token };
}

/** 서버가 스캔하는 프로젝트 디렉터리: ~/.claude/projects/<workspace-hash>/ */
export function projectDirFor(workspace: string): string {
  return path.join(os.homedir(), '.claude', 'projects', normalizeProjectPath(workspace));
}

export class OfficeClient {
  private readonly base: string;
  private readonly token: string;
  readonly workspace: string;
  readonly projectDir: string;

  constructor(server: ServerInfo, workspace: string) {
    this.base = `http://127.0.0.1:${server.port}`;
    this.token = server.token;
    this.workspace = workspace;
    this.projectDir = projectDirFor(workspace);
  }

  /** 채택에 필요한 트랜스크립트 경로 (세션 1개당 1파일). */
  transcriptPath(sessionId: string): string {
    return path.join(this.projectDir, `${sessionId}.jsonl`);
  }

  /** 최소 JSONL 파일 생성 — 파일이 존재해야 채택/폴링이 깔끔하다. */
  ensureTranscript(sessionId: string): string {
    const file = this.transcriptPath(sessionId);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    if (!fs.existsSync(file)) {
      const init = { type: 'system', subtype: 'init', content: 'pixel-agents-driver-ready' };
      fs.writeFileSync(file, `${JSON.stringify(init)}\n`);
    }
    return file;
  }

  private async postHook(payload: Record<string, unknown>): Promise<void> {
    try {
      const res = await fetch(`${this.base}${HOOK_PATH}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.token}`,
        },
        body: JSON.stringify(payload),
      });
      // 서버는 'ok' 텍스트만 반환. 본문은 버린다.
      await res.text().catch(() => '');
    } catch {
      // 훅 전송 실패는 치명적이지 않다 — 다음 신호로 회복.
    }
  }

  // ── 캐릭터 생명주기 신호 ────────────────────────────────────────────

  /** 세션 등장. transcript_path/cwd를 실어 서버가 pending으로 잡게 한다. */
  sessionStart(sessionId: string): Promise<void> {
    return this.postHook({
      hook_event_name: 'SessionStart',
      session_id: sessionId,
      source: 'startup',
      transcript_path: this.transcriptPath(sessionId),
      cwd: this.workspace,
    });
  }

  /** 행동 시작 → 책상으로 걸어가 타이핑/읽기 애니메이션. */
  toolStart(
    sessionId: string,
    toolName: string,
    toolInput: Record<string, unknown>,
  ): Promise<void> {
    return this.postHook({
      hook_event_name: 'PreToolUse',
      session_id: sessionId,
      tool_name: toolName,
      tool_input: toolInput,
    });
  }

  /** 행동 종료 → 애니메이션 종료. */
  toolEnd(sessionId: string): Promise<void> {
    return this.postHook({ hook_event_name: 'PostToolUse', session_id: sessionId });
  }

  /** 턴 종료(휴식) → 대기 상태. 미지의 pending 세션을 확정시키는 확인 이벤트이기도 하다. */
  stop(sessionId: string): Promise<void> {
    return this.postHook({ hook_event_name: 'Stop', session_id: sessionId });
  }

  /** 세션 종료 → 캐릭터 퇴장. */
  sessionEnd(sessionId: string, reason = 'exit'): Promise<void> {
    return this.postHook({ hook_event_name: 'SessionEnd', session_id: sessionId, reason });
  }

  /** 채택 후 더 이상 폴링이 캐릭터를 되살리지 않도록 트랜스크립트 정리. */
  removeTranscript(sessionId: string): void {
    try {
      fs.rmSync(this.transcriptPath(sessionId), { force: true });
    } catch {
      /* ignore */
    }
  }
}
