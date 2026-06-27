# Pixel Agents — Claude Code 없이 동작하기

> **세션 이어하기**: 작업 맥락·파일 맵·다음 단계는 [`HANDOFF.md`](./HANDOFF.md) 참고.

## 최종 목표 (North Star)

**Claude Code가 설치·실행되지 않아도** Pixel Agents가 정상 동작해야 한다.

- 사용자는 **자신이 쓰는 AI 코딩 CLI**(Hooks API + 선택적 JSONL 트랜스크립트)만 설정하면 된다
- Claude Code는 **선택적 번들 provider**일 뿐, 필수 의존성이 아니다
- **1차 배포 환경**: `npx pixel-agents` CLI + 브라우저 SPA

### 이 목표가 의미하는 것

| 동작                | Claude 없이 필요한 것                                |
| ------------------- | ---------------------------------------------------- |
| 에이전트 활동 감지  | 대상 CLI의 Hooks → `POST /api/hooks/<providerId>`    |
| 도구 시작/종료 UI   | provider별 `normalizeHookEvent` + (선택) JSONL 폴링  |
| + Agent 버튼        | `providers.json`의 `launchCommand`로 **그 CLI** 실행 |
| 외부 세션 자동 발견 | provider별 `sessionProjectsRoot` 스캔                |
| Hook 설치           | provider별 `settingsPath`에 hook 엔트리 등록         |

### 범위 밖 (별도 프로젝트)

- **Cursor IDE 내장 Agent** — 공개 Hooks/트랜스크립트 API 없음
- **Cursor SDK** — 프로그래매틱 API, IDE 패널 연동과 다름

---

## 현재 상태 (Step 2·3 부분 완료 후)

**Codex CLI만으로 기본 기동 가능.** Claude는 선택 사항이다.

| 영역                  | 상태                                                                |
| --------------------- | ------------------------------------------------------------------- |
| 기본 enabled provider | `codex` (`loadProviders.ts`, `registry.ts`)                         |
| 번들 provider         | `claude`, `codex`                                                   |
| Hook 라우팅           | `POST /api/hooks/:providerId` → `registry.get(providerId)`          |
| 범용 hook 스크립트    | `pixel-agents-hook.js <providerId>` → `POST /api/hooks/<id>`        |
| CLI hook 설치·스캔    | enabled provider 전체 (`installEnabledProviderHooks`)               |
| `providers.json`      | 읽기 지원 (`defaultProvider`, `enabled`) — **custom 로드는 미구현** |
| VS Code hook on/off   | enabled provider 전체 (`PixelAgentsViewProvider`)                   |
| VS Code `+ Agent`     | 여전히 `claude` 고정 (`agentManager.ts`)                            |
| JSONL 폴링            | 전역 default provider — **per-agent 미적용**                        |
| generic provider      | **미구현**                                                          |

### 남은 Claude 의존 (제거 대상)

| 위치                                     | 내용                                                       |
| ---------------------------------------- | ---------------------------------------------------------- |
| `adapters/vscode/agentManager.ts`        | `claudeProvider.buildLaunchCommand` 고정                   |
| `transcriptParser.ts` / `fileWatcher.ts` | `registry.getDefault()` 전역 사용, agent별 provider 미조회 |
| `providers.json` `custom`                | 설정 기반 provider 팩토리 없음                             |

---

## 목표 (이전 문서 — 참고용)

~~Claude Code에 하드코딩된 Pixel Agents를 Hooks API CLI로 확장~~  
→ 위 North Star로 대체됨. Claude 지원은 **옵션**으로 유지.

---

## 해결된 문제 (Step 1~3)

### ~~1. 프로바이더가 전역으로 Claude 하나만 존재~~ → 해결

| 파일                                         | 변경 내용                                                          |
| -------------------------------------------- | ------------------------------------------------------------------ |
| `server/src/hookEventHandler.ts`             | `ProviderRegistry` 사용, `handleEvent(providerId)`로 provider 조회 |
| `server/src/agentRuntime.ts`                 | 생성자가 `ProviderRegistry` 수신                                   |
| `server/src/cli.ts`                          | enabled provider 전체 hook 설치·세션 스캔                          |
| `server/src/clientMessageHandler.ts`         | enabled provider capabilities 합집합                               |
| `adapters/vscode/PixelAgentsViewProvider.ts` | `installEnabledProviderHooks` / `uninstallEnabledProviderHooks`    |

### ~~2. HTTP 라우트는 멀티 프로바이더인데 정규화가 Claude만~~ → 해결

`registry.get(providerId).normalizeHookEvent(raw)`로 라우팅됨.

### ~~3. Hook 스크립트가 Claude 전용~~ → 부분 해결

| 스크립트               | 용도                                                                    |
| ---------------------- | ----------------------------------------------------------------------- |
| `pixel-agents-hook.js` | 범용 — `argv[2]`로 providerId, Codex 등 JSON hooks용                    |
| `claude-hook.js`       | 레거시 — Claude `~/.claude/settings.json` 전용 (claude enabled 시 복사) |

| Installer                | 설정 파일                 |
| ------------------------ | ------------------------- |
| `codexHookInstaller.ts`  | `~/.codex/hooks.json`     |
| `claudeHookInstaller.ts` | `~/.claude/settings.json` |
| `jsonHooksInstaller.ts`  | JSON hooks 공통 로직      |

### ~~4. agent.providerId 미활용~~ → 부분 해결

Hook 이벤트 수신 시 `agent.providerId` 자동 설정. JSONL 경로는 아직 전역 default 사용.

---

## 목표 아키텍처

```
┌─────────────────────────────────────────────────────────────┐
│  CLI / Browser / VS Code Adapter                            │
│  - enabled providers 설정                                    │
│  - 모든 enabled provider에 hook 설치                          │
│  - 모든 provider session root 스캔                            │
└──────────────────────────┬──────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────┐
│  ProviderRegistry                                            │
│  - register(claudeProvider, codexProvider, generic...)       │
│  - get(id), getEnabled(), getForAgent(agent)                 │
│  - ~/.pixel-agents/providers.json 에서 enabled/default 로드   │
└──────────────────────────┬──────────────────────────────────┘
                           │
         ┌─────────────────┼─────────────────┐
         ▼                 ▼                 ▼
   claude/            codex/ ✅          generic/ (예정)
   claude.ts          codex.ts           generic.ts
         │                 │
         └────────┬────────┘
                  ▼
┌─────────────────────────────────────────────────────────────┐
│  AgentRuntime + HookEventHandler                             │
│  - handleEvent(providerId) → registry.get(providerId)       │
│  - agent.providerId → (예정) transcript/fileWatcher 조회     │
└──────────────────────────┬──────────────────────────────────┘
                           │
         ┌─────────────────┴─────────────────┐
         ▼                                   ▼
  POST /api/hooks/:id                  JSONL 폴링 (500ms)
  pixel-agents-hook.js <id>            provider별 session dir
         │                                   │
         └─────────────┬─────────────────────┘
                       ▼
              AgentStateStore.broadcast
                       ▼
              webview / WebSocket UI
```

### 핵심 원칙

1. **정규화 경계 유지**: 각 provider의 `normalizeHookEvent()`만 raw payload를 해석한다.
2. **공통 이벤트 모델 유지**: `core/src/provider.ts`의 `AgentEvent` union을 그대로 사용한다.
3. **Claude 호환 스키마를 generic 기본값으로**: 많은 CLI가 Claude Code Hooks 형식(`hook_event_name`, `session_id`, `tool_name` 등)을 따른다.
4. **JSONL 폴링은 provider별**: `getSessionDirs()`, `sessionFilePattern`을 provider가 선언한다.

---

## 구현된 파일

### 인프라 (완료)

| 파일                                                             | 상태                                                |
| ---------------------------------------------------------------- | --------------------------------------------------- |
| `server/src/providers/registry.ts`                               | ✅                                                  |
| `server/src/providers/loadProviders.ts`                          | ✅ claude + codex, `providers.json` enabled/default |
| `server/src/providers/providerConfig.ts`                         | ✅ 읽기, capabilities 합집합                        |
| `server/src/providers/hookInstall.ts`                            | ✅ enabled 일괄 hook 설치                           |
| `server/src/providers/hook/shared/claudeCompatibleHooks.ts`      | ✅ 공유 정규화                                      |
| `server/src/providers/hook/shared/pixelAgentsHook.ts`            | ✅ 범용 hook 스크립트                               |
| `server/src/providers/hook/shared/jsonHooksInstaller.ts`         | ✅ JSON hooks 설치 공통                             |
| `server/src/providers/hook/shared/formatCompatibleToolStatus.ts` | ✅ Codex 도구명 포함                                |
| `server/src/providers/hook/codex/codex.ts`                       | ✅ Codex HookProvider                               |
| `server/src/providers/hook/codex/codexHookInstaller.ts`          | ✅ `~/.codex/hooks.json`                            |

### 미구현 (예정)

| 파일                                                        | 역할                                         |
| ----------------------------------------------------------- | -------------------------------------------- |
| `server/src/providers/hook/generic/generic.ts`              | 설정 기반 `HookProvider` 팩토리              |
| `server/src/providers/hook/generic/genericHookInstaller.ts` | 임의 `settings.json` 경로에 hook 엔트리 설치 |
| `server/src/providers/hook/generic/types.ts`                | 커스텀 provider 설정 타입                    |

### 서버 코어

| 파일                                 | 상태                                         |
| ------------------------------------ | -------------------------------------------- |
| `server/src/hookEventHandler.ts`     | ✅                                           |
| `server/src/agentRuntime.ts`         | ✅                                           |
| `server/src/transcriptParser.ts`     | ⬜ per-agent provider                        |
| `server/src/fileWatcher.ts`          | ⬜ per-agent provider                        |
| `server/src/clientMessageHandler.ts` | ✅ capabilities 합집합                       |
| `server/src/cli.ts`                  | ✅ `--providers` / `--provider`              |
| `esbuild.js`                         | ✅ `pixel-agents-hook.js` + `claude-hook.js` |

### VS Code 어댑터

| 파일                                         | 상태                       |
| -------------------------------------------- | -------------------------- |
| `adapters/vscode/PixelAgentsViewProvider.ts` | ✅ hook 일괄화             |
| `adapters/vscode/agentManager.ts`            | ⬜ default provider launch |

### 테스트

| 파일                                          | 상태      |
| --------------------------------------------- | --------- |
| `server/__tests__/registry.test.ts`           | ✅        |
| `server/__tests__/hookEventHandler.test.ts`   | ✅        |
| `server/__tests__/codex.test.ts`              | ✅        |
| `server/__tests__/codexHookInstaller.test.ts` | ✅        |
| `server/__tests__/claude.test.ts`             | ✅ (회귀) |
| `server/__tests__/genericProvider.test.ts`    | ⬜        |

**현재: `npm run test:server` — 227 tests passed**

---

## 커스텀 Provider 설정 (`~/.pixel-agents/providers.json`)

### 현재 지원 (Step 2·3)

```json
{
  "defaultProvider": "codex",
  "enabled": ["codex"]
}
```

- `enabled`에 `claude`가 없으면 Claude hook 설치·스캔을 **하지 않음**
- CLI 플래그 `--providers codex` / `--provider claude`로 런타임 override 가능

### 목표 (generic provider 완료 후)

```json
{
  "defaultProvider": "my-cli",
  "enabled": ["codex", "my-cli"],
  "custom": [
    {
      "id": "my-cli",
      "displayName": "My CLI",
      "settingsPath": "~/.my-cli/settings.json",
      "sessionProjectsRoot": "~/.my-cli/projects",
      "sessionFilePattern": "*.jsonl",
      "terminalNamePrefix": "My CLI",
      "launchCommand": "my-cli",
      "launchArgs": [],
      "hookEvents": [
        "SessionStart",
        "SessionEnd",
        "Stop",
        "PreToolUse",
        "PostToolUse",
        "PermissionRequest",
        "Notification"
      ],
      "readingTools": ["Read", "Grep", "Glob"],
      "subagentToolNames": ["Task", "Agent"],
      "permissionExemptTools": ["AskUserQuestion"]
    }
  ]
}
```

### 전제 조건 (generic provider가 동작하려면)

대상 CLI가 다음을 만족해야 한다.

1. **Hooks 설정 파일**에 command hook 등록 가능 (Claude Code `settings.json`의 `hooks` 객체와 유사)
2. Hook payload에 최소 `hook_event_name`, `session_id` 포함
3. (선택) 트랜스크립트 JSONL을 프로젝트별 디렉터리에 저장 — 없으면 `hooksOnly` 모드로만 동작

### Codex CLI (1순위 번들 provider)

| 항목        | 값                                                                            |
| ----------- | ----------------------------------------------------------------------------- |
| Hook 설정   | `~/.codex/hooks.json`                                                         |
| Hook 스키마 | Claude 호환 (`hook_event_name`, `session_id`, `tool_name`, `transcript_path`) |
| JSONL       | `~/.codex/sessions/YYYY/MM/DD/*.jsonl`                                        |
| Launch      | `codex` (cwd 기준)                                                            |

---

## Hook 설치 흐름 (현재)

```
CLI 시작
  → loadProvidersConfig() + createProviderRegistry()
  → Fastify 서버 시작, server.json 기록
  → installEnabledProviderHooks(registry, url, token, bundleRoot)
       copyPixelAgentsHookScript → ~/.pixel-agents/hooks/pixel-agents-hook.js
       (claude enabled 시) copyClaudeHookScript → claude-hook.js
       각 enabled provider.installHooks(url, token)
  → Codex: node pixel-agents-hook.js codex  (in ~/.codex/hooks.json)
  → Claude: node claude-hook.js             (in ~/.claude/settings.json)
  → CLI hook 실행 시 POST /api/hooks/<providerId>
```

---

## 데이터 흐름

### Hook 경로

```
CLI hook 실행
  → POST /api/hooks/:providerId
  → registry.get(providerId).normalizeHookEvent(raw)
  → HookEventHandler.dispatch(AgentEvent)
  → AgentStateStore.broadcast
  → WebSocket → browser UI
```

### JSONL 경로 (per-agent 미적용 — Step 4 예정)

```
500ms poll
  → agent.jsonlFile 읽기
  → (현재) registry.getDefault() 로 formatToolStatus
  → (목표) registry.getForAgent(agent)
  → processTranscriptLine → broadcast
```

---

## 구현 단계 (Claude 없이 동작 기준)

### Step 1 — Registry + HookEventHandler ✅

- `ProviderRegistry`, `hookEventHandler` providerId 라우팅
- `agent.providerId` hook 수신 시 설정

### Step 2 — Codex provider + `providers.json` ✅ (부분)

Claude 없이 돌아가는 **첫 실사용 경로** (Codex CLI).

- [x] `~/.pixel-agents/providers.json` — `defaultProvider`, `enabled` 읽기
- [x] `codex` provider — `~/.codex/hooks.json` hook 설치
- [x] `pixel-agents-hook.js` — `node hook.js <providerId>` → `POST /api/hooks/<id>`
- [x] `normalizeClaudeCompatibleHookEvent` 공유 (`hook/shared/claudeCompatibleHooks.ts`)
- [x] `loadProviders.ts` — codex 등록, **기본 enabled `['codex']`**, claude 없어도 기동
- [ ] `generic` provider — `providers.json` `custom` 항목으로 임의 CLI 등록

### Step 3 — Claude 의존 제거 (CLI·서버) ✅ (부분)

- [x] `cli.ts` — enabled provider 전체 hook 설치·세션 스캔
- [x] `clientMessageHandler.ts` — enabled provider 합집합 capabilities
- [x] `registry.ts` — fallback `'codex'`
- [x] `--provider <id>` / `--providers <ids>` CLI 플래그
- [ ] `PIXEL_AGENTS_PROVIDER` 환경변수

### Step 4 — per-agent provider (JSONL·감시)

- [ ] `transcriptParser` / `fileWatcher` — `getProviderForAgent(agent)` 사용
- [ ] Codex `~/.codex/sessions` 재귀 스캔 개선 (날짜 중첩 디렉터리)
- [ ] generic provider의 `sessionProjectsRoot`로 JSONL 폴링

### Step 5 — VS Code 어댑터 (선택)

- [ ] `agentManager` — enabled default provider의 `buildLaunchCommand` 사용
- [x] hook on/off — enabled provider 전체 (`PixelAgentsViewProvider`)

### Step 6 — 검증

- [ ] Claude 미설치 환경에서 Codex만으로 E2E
- [ ] Claude 미설치 환경에서 `providers.json` + generic만으로 E2E
- [ ] `docs/custom-providers.md` — “Claude 없이 시작하기” 가이드

---

## Claude 없이 동작하는 최소 설정 (현재)

```json
{
  "defaultProvider": "codex",
  "enabled": ["codex"]
}
```

또는 설정 파일 없이 `npx pixel-agents`만 실행해도 기본값은 codex이다.

```bash
npx pixel-agents
npx pixel-agents --providers codex
npx pixel-agents --providers claude,codex   # Claude도 함께
```

---

## 완료 기준 (Claude 없이 동작)

- [x] `POST /api/hooks/<providerId>` 라우팅
- [x] 기본 provider가 claude가 아님 (codex)
- [x] enabled provider 전체 hook 설치·스캔 (CLI)
- [x] Claude **있을 때** 기존 동작 회귀 없음 — 227 tests passed
- [ ] Claude 미설치 머신에서 `npx pixel-agents` + Codex hook만으로 캐릭터 반응 확인 (E2E)
- [ ] `enabled`에 claude가 없을 때 `~/.claude/settings.json`을 건드리지 않음 (수동 검증)
- [ ] generic provider로 Claude·Codex 외 CLI 등록 가능

---

## 참고 — 수정하지 않아도 되는 부분

| 영역                                | 이유                                           |
| ----------------------------------- | ---------------------------------------------- |
| `core/src/provider.ts` `AgentEvent` | 이미 agent-agnostic 설계                       |
| `core/asyncapi.yaml`                | 서버↔UI 프로토콜은 provider 무관               |
| `webview-ui/` 게임 엔진             | `agentToolStart` / `agentStatus` 메시지만 수신 |
| `server/src/httpServer.ts`          | 이미 `:providerId` 라우트 존재                 |
| `server/src/sessionRouter.ts`       | session_id 기준 라우팅, provider 무관          |

---

## 다음 작업

1. **Step 2 마무리** — `generic` provider + `providers.json` `custom` 로드
2. **Step 4** — `transcriptParser` / `fileWatcher` per-agent provider
3. **Step 5** — VS Code `agentManager` Codex launch
4. **Step 6** — Codex E2E 검증 + `docs/custom-providers.md`
