# Pixel Agents Driver — OpenRouter로 캐릭터 구동하기

`claude` 프로세스 없이, 각 에이전트가 **자기만의 OpenRouter 모델**로 업무를 단계로 분해해
수행하고, 그 행동이 픽셀 오피스에 캐릭터 움직임으로 보인다. (1단계 PoC: 서버 무수정, 신규 코드는 `driver/`에만)

서버 코드는 **한 줄도 고치지 않는다.** 드라이버는 검증된 Claude 훅 형식의 신호를
`POST /api/hooks/claude` 로 보내며, "스크립트 대신 OpenRouter로 구동되는 살아있는 mock-claude"로 동작한다.

## 현재 상태 — 완성 & 검증됨 ✅

실제 OpenRouter 키로 김대리·박사원·이주임 3명이 각자 다른 모델로 업무를 ≤5단계로 분해해
수행하는 것을 확인했다. 웹뷰가 받는 WebSocket 메시지(`agentCreated` / `agentStatus` /
`agentToolStart`)를 직접 캡처해, 오피스에 캐릭터 3명이 등장하고 한국어 작업 라벨
("Reading 보조금 신청서" 등)과 함께 active↔waiting 전이가 일어남을 검증했다.

## 동작 개요

```
드라이버(이 폴더)                     픽셀 오피스 서버(기존 그대로)
 각 에이전트 루프                       POST /api/hooks/claude
   OpenRouter 호출(다음 한 단계?)  ──▶   SessionStart → pending
   → read/write/run/rest          ──▶   확인 이벤트 → 캐릭터 생성
   → 훅 신호 + 한국어 로그          ──▶   PreToolUse/PostToolUse → 타이핑/읽기 애니메이션
                                        Stop → 대기
```

## 슬라이드 제약(제한 조건)을 코드로 못박음 — [`src/config.ts`](src/config.ts)

| 제약                       | 상수                                     | 값                     |
| -------------------------- | ---------------------------------------- | ---------------------- |
| 한 번 실행당 호출 최대 5회 | `MAX_LLM_CALLS_PER_RUN`                  | 5                      |
| temperature 0.2            | `TEMPERATURE`                            | 0.2                    |
| 입력(회의록) 1,000자 이하  | `MAX_CONTEXT_CHARS`                      | 1000                   |
| 출력 5줄 이하              | `MAX_OUTPUT_LINES` / `MAX_OUTPUT_TOKENS` | 5 / 160                |
| 그 외 AI 금지              | `AGENTS[].model`                         | OpenRouter 목록 모델만 |

"업무 분해(Decomposition)"는 **LLM 호출 1회 = 다음 한 단계 결정**으로 구현했다. 5단계를
채우거나 모델이 `rest`를 고르면 한 번의 실행을 마친다.

## 실행

### 1) 서버 띄우기 (터미널 A) — repo 루트에서

```bash
cd ..                 # repo 루트
npm run build         # 최초 1회 (dist/cli.js + dist/webview)
node dist/cli.js --providers claude
```

> 기본 provider는 `codex`라서 `--providers claude`로 띄워야 Claude 훅/JSONL 경로를 쓴다.
> 브라우저에서 http://127.0.0.1:3100 열기.

### 2) 키 넣기

```bash
cp .env.example .env
# .env 의 OPENROUTER_API_KEY=... 채우기
```

### 3) 드라이버 실행 (터미널 B)

```bash
cd driver
npm install        # 최초 1회 (tsx)
npm start
```

워크스페이스 기본값은 **repo 루트로 자동 고정**된다(실행 위치 무관). 서버를 repo 루트에서
띄웠다면 추가 설정 없이 김대리·박사원·이주임이 오피스에 등장해 각자 책상에서 일하기 시작하고,
터미널 B에 한국어 업무 로그가 흐른다.

## 수명주기 — Idle은 정상, 재실행하면 같은 캐릭터가 다시 일함

한 번의 실행은 **≤5단계 업무 분해 후 종료**한다(슬라이드 5회 제약). 끝나면 캐릭터는
**Idle(대기)** 상태로 오피스에 남는다 — 이게 정상이다.

다시 `npm start` 하면 **같은 3명이 다시 일한다.** 에이전트마다 workspace+이름 기반
**고정 세션 ID**(`stableSessionId`)를 쓰기 때문에, 재실행해도 새 캐릭터가 생기지 않고
기존 캐릭터가 재사용된다. (랜덤 ID였다면 실행할 때마다 새 캐릭터가 쌓여 이전 캐릭터들이
Idle로 서성였을 것이다.)

## 캐릭터가 안 보일 때

캐릭터는 서버가 스캔하는 `~/.claude/projects/<워크스페이스-해시>/` 에 트랜스크립트가
생길 때 채택된다. 드라이버의 워크스페이스 = **서버를 띄운 폴더**와 같아야 한다.

- 서버를 repo 루트가 아닌 곳에서 띄웠다면: `PIXEL_AGENTS_WORKSPACE=/그/폴더 npm start`
- 그래도 안 보이면 확실한 방법: 브라우저 **Settings → Watch All Sessions** 켜기 (워크스페이스 무관 채택)

드라이버 시작 로그에 "채택 대상 디렉터리"가 찍히니 그 경로를 서버의 "Scanning project dir" 로그와 비교하면 된다.

## 파일 구조

| 파일                | 역할                                                                              |
| ------------------- | --------------------------------------------------------------------------------- |
| `src/index.ts`      | 진입점: 설정 로드 → 서버 연결 → N명 동시 구동                                     |
| `src/config.ts`     | 에이전트 정원 + 슬라이드 제약 상수                                                |
| `src/agent.ts`      | 에이전트 1명의 업무 분해 루프 (최대 5 호출)                                       |
| `src/openrouter.ts` | OpenRouter 호출 + 관대한 JSON 파싱(작은 모델 폴백)                                |
| `src/office.ts`     | 서버 연동: server.json 읽기, 훅 POST, JSONL 쓰기, 고정 세션 ID(`stableSessionId`) |
| `src/actions.ts`    | action → tool_name + 한국어 문구 매핑                                             |
| `src/logger.ts`     | 한국어 컬러 로그                                                                  |
| `src/types.ts`      | 공용 타입                                                                         |
