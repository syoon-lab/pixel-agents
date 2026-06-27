# Pixel Agents — 세션 핸드오프 (2026-06-25)

> **새 세션에서 이 문서를 먼저 읽고 작업을 이어가세요.**  
> 상세 설계·단계별 계획은 [`PLAN.md`](./PLAN.md) 참고.

---

## 한 줄 요약

**Claude Code 없이** Pixel Agents가 돌아가도록 멀티 프로바이더 인프라를 구축했고, **1순위 대상인 OpenAI Codex CLI**를 번들 provider로 연동했다. 기본 enabled provider는 `codex`이다.

---

## 프로젝트 위치

```
/Users/yoon/개인/AI교육/실습/AI Agent/pixel-agents/
```

원본: `pixel-agents-hq/pixel-agents` 클론. VS Code 확장 + standalone CLI(`npx pixel-agents`) + 브라우저 SPA.

---

## North Star (변하지 않는 목표)

1. **Claude Code는 선택 사항** — 필수 의존성 아님
2. **1차 배포**: `npx pixel-agents` + 브라우저 SPA (VS Code 확장은 2차)
3. AI 코딩 CLI는 **Hooks API** (+ 선택적 JSONL)로 연동
4. **1순위 연동 CLI**: OpenAI Codex CLI (Claude와 유사한 hook 스키마)

---

## 지금까지 한 일 (시간순)

### Phase A — 정리·클론

- 작업공간에서 `pixel-agents-hq/pixel-agents`를 `pixel-agents/`에 클론
- Claude Code 환경에서 기존 동작 확인됨

### Phase B — Step 1: ProviderRegistry ✅

- `ProviderRegistry` 도입: register / get / getEnabled / getForAgent / setEnabledIds
- `HookEventHandler`가 `providerId`별로 provider 조회 후 `normalizeHookEvent` 호출
- `AgentRuntime` 생성자가 `ProviderRegistry` 수신
- hook 수신 시 `agent.providerId` 자동 설정
- 테스트: `registry.test.ts`, `hookEventHandler.test.ts` 갱신

### Phase C — Step 2·3: Codex + 멀티 프로바이더 ✅ (부분)

- **Codex provider** 추가 (`server/src/providers/hook/codex/`)
- **범용 hook 스크립트** `pixel-agents-hook.js` — `argv[2]`로 providerId → `POST /api/hooks/<id>`
- **JSON hooks installer** 공통화 (`jsonHooksInstaller.ts`) — `~/.codex/hooks.json` 등
- **`providers.json` 읽기** (`defaultProvider`, `enabled`) — **`custom` 로드는 아직 없음**
- **기본 enabled를 `codex`로 변경** (`loadProviders.ts`, `registry.ts`)
- **CLI** `--providers` / `--provider` 플래그, enabled 전체 hook 설치·세션 스캔
- **VS Code** `PixelAgentsViewProvider` hook on/off 일괄화
- **esbuild** `pixel-agents-hook.js` 빌드 추가
- **PLAN.md** 현재 상태 반영

---

## 현재 동작 상태

| 항목                 | 상태                                                      |
| -------------------- | --------------------------------------------------------- |
| 기본 provider        | `codex`                                                   |
| 번들 providers       | `claude`, `codex`                                         |
| Hook HTTP            | `POST /api/hooks/:providerId` ✅                          |
| Codex hook 설치      | `~/.codex/hooks.json` ✅                                  |
| Claude hook 설치     | `~/.claude/settings.json` (enabled 시만) ✅               |
| CLI 멀티 hook 설치   | `installEnabledProviderHooks()` ✅                        |
| UI capabilities      | enabled provider 합집합 ✅                                |
| generic provider     | ❌ 미구현                                                 |
| per-agent JSONL      | ❌ `transcriptParser`/`fileWatcher`가 전역 default만 사용 |
| VS Code + Agent 버튼 | ❌ `agentManager.ts`가 claude 고정                        |
| E2E (Codex only)     | ❌ 수동 검증 안 함                                        |

**테스트**: `npm run test:server` → **227 passed** (마지막 확인 시점)

---

## 핵심 파일 맵

### Provider 인프라

| 파일                                     | 역할                                     |
| ---------------------------------------- | ---------------------------------------- |
| `server/src/providers/registry.ts`       | ProviderRegistry, fallback `codex`       |
| `server/src/providers/loadProviders.ts`  | claude+codex 등록, providers.json 반영   |
| `server/src/providers/providerConfig.ts` | providers.json 읽기, capabilities 합집합 |
| `server/src/providers/hookInstall.ts`    | enabled 일괄 hook 설치/제거              |
| `server/src/providers/index.ts`          | 공개 export                              |

### Codex

| 파일                                                    | 역할                  |
| ------------------------------------------------------- | --------------------- |
| `server/src/providers/hook/codex/codex.ts`              | HookProvider 구현     |
| `server/src/providers/hook/codex/codexHookInstaller.ts` | `~/.codex/hooks.json` |
| `server/src/providers/hook/codex/constants.ts`          | 이벤트·경로 상수      |

### 공유 hook

| 파일                                                             | 역할                            |
| ---------------------------------------------------------------- | ------------------------------- |
| `server/src/providers/hook/shared/pixelAgentsHook.ts`            | 범용 hook 스크립트 소스         |
| `server/src/providers/hook/shared/jsonHooksInstaller.ts`         | JSON hooks 설치 + 스크립트 복사 |
| `server/src/providers/hook/shared/claudeCompatibleHooks.ts`      | hook → AgentEvent 정규화        |
| `server/src/providers/hook/shared/formatCompatibleToolStatus.ts` | Codex 도구명 포함 status        |

### 서버 진입점

| 파일                                 | 역할                                                          |
| ------------------------------------ | ------------------------------------------------------------- |
| `server/src/cli.ts`                  | standalone CLI, `--providers`                                 |
| `server/src/hookEventHandler.ts`     | providerId 라우팅                                             |
| `server/src/agentRuntime.ts`         | registry 주입, default provider로 transcript/fileWatcher 연결 |
| `server/src/clientMessageHandler.ts` | WebSocket, capabilities                                       |
| `esbuild.js`                         | `dist/hooks/pixel-agents-hook.js` + `claude-hook.js` 빌드     |

### 아직 Claude에 묶인 파일

| 파일                                 | 내용                                                               |
| ------------------------------------ | ------------------------------------------------------------------ |
| `adapters/vscode/agentManager.ts`    | `claudeProvider.buildLaunchCommand` 고정                           |
| `server/src/transcriptParser.ts`     | 모듈 전역 `hookProvider` (runtime 시작 시 `getDefault()` 1회 설정) |
| `server/src/fileWatcher.ts`          | 동일                                                               |
| `server/src/clientMessageHandler.ts` | registry 없을 때 claude fallback (embedded VS Code 경로)           |

---

## Codex CLI 연동 참고

| 항목         | 값                                                                                         |
| ------------ | ------------------------------------------------------------------------------------------ |
| Hooks 설정   | `~/.codex/hooks.json`                                                                      |
| Hook command | `node ~/.pixel-agents/hooks/pixel-agents-hook.js codex`                                    |
| Payload      | Claude 호환: `hook_event_name`, `session_id`, `tool_name`, `tool_input`, `transcript_path` |
| JSONL        | `~/.codex/sessions/YYYY/MM/DD/*.jsonl` (날짜 중첩 — 스캔은 best-effort)                    |
| Launch       | `codex` (cwd=`PWD`)                                                                        |

**주의**: Codex는 hook의 `transcript_path`로 세션 입양 가능. 글로벌 JSONL 스캔은 Claude와 디렉터리 구조가 달라 Step 4에서 개선 예정.

---

## 설정

### `~/.pixel-agents/providers.json` (현재 지원 필드)

```json
{
  "defaultProvider": "codex",
  "enabled": ["codex"]
}
```

- 파일 없으면 기본 `enabled: ["codex"]`
- `enabled`에 `claude` 없으면 Claude hook/settings **건드리지 않음**
- `custom` 배열은 **아직 파싱·등록 안 됨** (generic provider 작업 시 구현)

### CLI

```bash
cd pixel-agents
npm run build          # dist/cli.js + dist/hooks/*.js + webview
npm run test:server    # 227 tests

npx pixel-agents                           # 기본 codex
npx pixel-agents --providers codex
npx pixel-agents --providers claude,codex
npx pixel-agents --port 3100 --host 127.0.0.1
```

Hook 스크립트 복사 경로: `copyPixelAgentsHookScript(bundleRoot)`는  
`bundleRoot/hooks/` 또는 `bundleRoot/dist/hooks/` 를 자동 탐색 (CLI `__dirname` = `dist/` 대응).

---

## 아키텍처 스냅샷

```
Codex/Claude hook
  → POST /api/hooks/:providerId
  → ProviderRegistry.get(providerId).normalizeHookEvent()
  → HookEventHandler → AgentStateStore.broadcast
  → WebSocket → browser SPA

CLI 시작 시:
  createProviderRegistry()
  → installEnabledProviderHooks(registry, url, token, distRoot)
  → enabled provider별 getSessionDirs(cwd) 스캔
```

---

## 다음 작업 (우선순위)

### 1. generic provider (PLAN Step 2 마무리) — **가장 큰 미완**

- [ ] `server/src/providers/hook/generic/types.ts` — `CustomProviderConfig` 타입
- [ ] `server/src/providers/hook/generic/generic.ts` — 설정 → `HookProvider` 팩토리
- [ ] `server/src/providers/hook/generic/genericHookInstaller.ts` — `settingsPath`에 hook 설치
- [ ] `loadProviders.ts` — `providers.json`의 `custom[]` 파싱 후 `registry.register()`
- [ ] `server/__tests__/genericProvider.test.ts`

참고 스키마: `PLAN.md`의 `providers.json` 예시.

### 2. per-agent provider (PLAN Step 4)

- [ ] `transcriptParser.ts` — `setHookProvider(provider)` 대신 agent별 `registry.getForAgent(agent)` 조회
- [ ] `fileWatcher.ts` — 동일 + `getAllSessionRoots()`를 enabled 전체로 확장
- [ ] `agentRuntime.ts` — registry만 주입하고 per-call 조회로 전환

### 3. VS Code launch (PLAN Step 5)

- [ ] `adapters/vscode/agentManager.ts` — `registry.getDefault().buildLaunchCommand()` 또는 agent.providerId 기준

### 4. 검증 (PLAN Step 6)

- [ ] Claude 미설치 환경에서 Codex hook → 브라우저 캐릭터 반응 E2E
- [ ] `docs/custom-providers.md` 작성

### 5. 소소한 미완

- [ ] `PIXEL_AGENTS_PROVIDER` 환경변수 (`cli.ts`)
- [ ] `httpServer` / VS Code embedded 경로에 `providerRegistry` 전달 (capabilities fallback 제거)

---

## 구현 시 주의사항

1. **`codex.ts`의 `getCodexSessionsRoot()`** — 모듈 로드 시 `os.homedir()` 호출 금지. 테스트에서 `vi.mock('os')` 전에 import되면 `path.join(undefined, ...)` 크래시 남. **lazy 함수로 유지할 것.**

2. **Hook 스크립트 2종**
   - `pixel-agents-hook.js` — Codex 등 (providerId 인자)
   - `claude-hook.js` — Claude legacy (`/api/hooks/claude` 고정)
   - `installEnabledProviderHooks`가 claude enabled 시 둘 다 복사

3. **테스트 샌드박스** — `claudeTeamProvider.test.ts` 등이 실제 `~/.claude`에 쓰려 하면 sandbox에서 EPERM. `npm run test:server`는 전체 권한에서 돌리거나 mock 확인.

4. **커밋** — 사용자가 명시적으로 요청할 때만. 현재 작업은 커밋 여부 불명.

5. **응답 언어** — 사용자는 한국어 선호.

---

## 관련 문서

| 문서                         | 용도                                   |
| ---------------------------- | -------------------------------------- |
| [`PLAN.md`](./PLAN.md)       | North Star, 단계별 계획, 완료 기준     |
| [`HANDOFF.md`](./HANDOFF.md) | 이 문서 — 세션 이어하기                |
| `core/src/provider.ts`       | `HookProvider`, `AgentEvent` 타입 정의 |

---

## 이전 대화 맥락 (의사결정 기록)

1. VS Code 확장보다 **`npx pixel-agents` + 브라우저**를 1차 목표로 설정
2. 범용 Hooks API 방향으로 설계 — Claude 전용에서 탈피
3. 연동 대상 CLI 후보 중 **"첫번째껄로"** → **OpenAI Codex CLI** 선택 (Claude 유사 hook 스키마)
4. Step 1 (Registry) 완료 후 Step 2 (Codex) 진행 중 세션 컨텍스트 제한으로 요약 후 이어서 작업
5. PLAN.md는 2026-06-25에 Step 2·3 부분 완료 상태로 갱신됨

---

## 새 세션 시작 체크리스트

```
[ ] HANDOFF.md (이 파일) 읽기
[ ] PLAN.md "다음 작업" 확인
[ ] npm run test:server 로 회귀 확인
[ ] 작업 범위 결정: generic provider vs per-agent JSONL vs E2E 검증
[ ] npm run build 후 npx pixel-agents로 수동 smoke test (선택)
```

---

_마지막 업데이트: 2026-06-25 — Codex provider 연동 + PLAN/HANDOFF 작성 완료_
