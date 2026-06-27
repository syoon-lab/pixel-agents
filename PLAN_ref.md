# PLAN — OpenRouter 드라이버로 픽셀 에이전트 구동하기

> 목표: **Claude Code CLI 없이**, 각 에이전트마다 **자기만의 OpenRouter API(SLM 모델)** 를
> 붙여서 스스로 행동하게 만든다. 그 행동이 픽셀 오피스에 캐릭터 움직임으로 보인다.
> 한 터미널 프로세스에서 N개 에이전트 루프가 돌아가고, 로그는 **한국어 업무 설명**으로 나온다.

---

## 0. 한 줄 요약

`claude` 프로세스 자리를 **내가 만든 드라이버 프로세스 하나**가 대체한다.
드라이버 안의 각 에이전트는 OpenRouter로 LLM을 호출해 "다음에 뭘 할지"를 정하고,
그 행동을 픽셀 오피스 서버가 이해하는 신호로 바꿔 보낸다. 서버/웹뷰/렌더링은 **그대로 재사용**.

```
┌─ 드라이버 (단일 터미널 프로세스, node) ───────────────┐
│  agent[0]  김대리   → OpenRouter(llama-3.2-3b)  ─┐    │
│  agent[1]  박사원   → OpenRouter(qwen-2.5-7b)   ─┤    │
│  agent[2]  이주임   → OpenRouter(ministral-3b)  ─┤    │
│        … 각자 독립 루프 …                         │    │
└──────────────────────────────────────────────────┼────┘
                                                    │ 행동 신호
                                                    ▼
                        Pixel Agents 서버 (기존 그대로)
                                                    ▼
                               오피스 웹뷰: 캐릭터가 걷고/타이핑/대기
```

---

## 1. 기존 시스템에서 재사용하는 것 / 새로 만드는 것

| 구분     | 항목                                                                 | 상태      |
| -------- | -------------------------------------------------------------------- | --------- |
| 재사용   | 서버(`server/`), 오피스 웹뷰, 렌더링, 캐릭터 FSM                     | 그대로    |
| 재사용   | 훅 입구 `POST /api/hooks/:providerId`, `~/.pixel-agents/server.json` | 그대로    |
| 재사용   | 외부 세션 채택(스캐너) → 캐릭터 생성 경로                            | 그대로    |
| **신규** | **드라이버**: N개 에이전트 루프 (이 PLAN의 핵심)                     | 새로 만듦 |
| 신규     | 에이전트별 OpenRouter 클라이언트 (모델/키 독립)                      | 새로 만듦 |
| 신규     | "행동" → 오피스 신호 변환기                                          | 새로 만듦 |
| 신규     | 한국어 업무 로그 출력                                                | 새로 만듦 |

> **핵심 원칙:** 서버 코드는 1단계(PoC)에서 **건드리지 않는다.** 드라이버는 기존
> `claude`가 하던 것과 동일한 외형(세션 시작/도구 사용/턴 종료 신호)을 흉내 내기만 한다.
> 이미 e2e의 `mock-claude`가 이 패턴이 동작함을 증명해 둠 → 우리 드라이버는
> **"스크립트 대신 OpenRouter로 구동되는 살아있는 mock-claude"** 다.

---

## 2. 에이전트 한 명의 행동 루프 (이게 진짜 핵심)

각 에이전트는 독립적으로 아래 루프를 돈다. **에이전트마다 OpenRouter 모델/시스템 프롬프트가 다를 수 있다.**

```
1. (시작) 세션 시작 신호 → 캐릭터가 오피스에 등장
2. LLM 호출: "당신은 사무실 직원입니다. 지금 무슨 작업을 할까요?
              가능한 행동: 파일 읽기 / 코드 작성 / 명령 실행 / 휴식.
              JSON으로 {action, target, reason} 형식으로 답하세요."
3. LLM 응답 파싱 → 행동(action) 결정
4. 행동 시작 신호 전송  → 캐릭터가 책상으로 걸어가 타이핑/읽기 애니메이션
   (한국어 로그: "[김대리] 📖 config.ts 를 살펴보고 있어요")
5. 잠깐 대기(행동 지속 시간) — 작은 모델이라 실제 작업 대신 시간 흉내
6. 행동 종료 신호 전송  → 애니메이션 종료
7. 가끔 턴 종료 신호    → 캐릭터가 "완료/대기" 상태
8. 1~2초 쉬고 2번으로 반복
```

- **PoC 단계의 "작업"은 데모용**: 실제 파일을 건드리지 않는다. LLM은 "무슨 일을 하는 척"
  할지를 생성하고, 드라이버는 그걸 행동 신호 + 한국어 로그로 바꾼다.
  → 작은 모델로도 안정적이고, 오피스에서 캐릭터가 살아 움직이는 걸 바로 확인 가능.
- 나중에 실제 작업(파일 읽기/수정 등)으로 교체할 수 있도록 `action` 핸들러를 분리해 둔다.

### LLM 출력 계약 (작은 모델 안정화)

```jsonc
// OpenRouter에 요청하는 응답 형식 (JSON mode / 강제 프롬프트)
{
  "action": "read" | "write" | "run" | "rest",   // 4종으로 제한
  "target": "config.ts",                          // 대상 (없으면 빈 문자열)
  "reason": "설정 값을 확인하려고"                  // 한국어 한 줄
}
```

- 작은 모델은 자유 서술이 들쭉날쭉 → **action은 4종 enum으로 제한**, 검증 실패 시 `rest`로 폴백.
- `reason`(한국어 한 줄)만 모델이 생성, 나머지 한국어 문구는 드라이버 템플릿이 조립.

---

## 3. 행동 → 오피스 신호 매핑

오피스가 이해하는 신호는 **Claude 훅 페이로드 형식**이다 (검증된 형식, [claude.ts](server/src/providers/hook/claude/claude.ts) 참고).
드라이버는 행동을 아래 `tool_name`으로 매핑해 `POST /api/hooks/claude` 로 보낸다.

| 에이전트 행동  | tool_name  | 오피스 애니메이션    | 한국어 로그 예시                              |
| -------------- | ---------- | -------------------- | --------------------------------------------- |
| read           | `Read`     | 책상으로 이동 → 읽기 | `[김대리] 📖 {target} 파일을 살펴보고 있어요` |
| write          | `Edit`     | 타이핑               | `[박사원] ✏️ {target} 를 수정하는 중이에요`   |
| run            | `Bash`     | 타이핑               | `[이주임] ⚙️ 명령을 실행하고 있어요`          |
| rest (턴 종료) | — (`Stop`) | 대기 말풍선          | `[김대리] ☕ 잠깐 쉬는 중이에요`              |

훅 페이로드 형식(드라이버가 보내는 JSON):

```jsonc
// 행동 시작
{ "session_id": "<agent-uuid>", "hook_event_name": "PreToolUse",
  "tool_name": "Read", "tool_input": { "file_path": "config.ts" } }
// 행동 종료
{ "session_id": "<agent-uuid>", "hook_event_name": "PostToolUse" }
// 턴 종료(휴식)
{ "session_id": "<agent-uuid>", "hook_event_name": "Stop" }
```

> 한국어 변환은 **드라이버 쪽 고정 템플릿**으로 (작은 모델 안정성). `Read/Edit/Bash` →
> 위 표의 문구로 매핑. 모델은 `reason`만 생성.

---

## 4. 캐릭터를 화면에 띄우는 방법 (지원 세부)

> ⚠️ 발견: 훅만 POST하면 **새 세션은 캐릭터가 안 생긴다** (서버에서 "Phase C"로 미뤄짐,
> [hookEventHandler.ts:164](server/src/hookEventHandler.ts#L164)). 캐릭터는 **외부 세션 채택 스캐너**가
> JSONL 트랜스크립트를 발견할 때 생긴다.

**1단계(PoC) 방식 — 서버 무수정:**

- 드라이버가 에이전트별로 최소 JSONL 트랜스크립트 파일을 만든다
  (`~/.claude/projects/<workspace-hash>/<session>.jsonl`, mock-claude와 동일 형식).
- standalone 서버가 그 파일을 채택 → 캐릭터 등장.
- 이후 활동은 훅(`/api/hooks/claude`)으로 구동 → 즉각/깔끔한 상태 표시.
- 드라이버의 작업 디렉터리(cwd)를 standalone 워크스페이스로 맞추면 `Watch All Sessions`
  없이도 채택됨. (다른 폴더면 설정에서 Watch All Sessions ON)

이 한 줄짜리 JSONL 의존이 거슬리면 → **2단계에서 제거**(provider 승격 시 서버가 훅만으로 캐릭터 생성).

---

## 5. 드라이버 파일 구조 (신규, 서버와 분리)

```
driver/                          # 새 폴더 (기존 코드 import 안 함, 독립 실행)
  package.json                   # type: module, bin 없음, node 직접 실행
  src/
    index.ts                     # 진입점: 설정 로드 → N개 에이전트 spawn → 루프 시작
    config.ts                    # 에이전트 정의 (이름/모델/시스템프롬프트), 키는 env
    agent.ts                     # 에이전트 1명의 행동 루프 (2장 로직)
    openrouter.ts                # OpenRouter 클라이언트 (OpenAI 호환 fetch)
    office.ts                    # 서버 연동: server.json 읽기, 훅 POST, JSONL 쓰기
    actions.ts                   # action → tool_name + 한국어 문구 매핑 (3장 표)
    logger.ts                    # 한국어 컬러 로그 ([이름] 이모지 설명)
```

- 환경변수: `OPENROUTER_API_KEY` (전역) — 에이전트별로 다른 키 쓰려면 `config.ts`에서 지정.
- 실행: `node driver/dist/index.js` (또는 tsx). 별도 터미널 1개.
- **기존 `server/`, `webview-ui/`, `core/` 는 1단계에서 import도 수정도 안 함.**

### `config.ts` 예시

```ts
export const AGENTS = [
  { name: '김대리', model: 'meta-llama/llama-3.2-3b-instruct' },
  { name: '박사원', model: 'qwen/qwen-2.5-7b-instruct' },
  { name: '이주임', model: 'mistralai/ministral-3b' },
];
```

---

## 6. 실행 흐름 (사용자 관점)

```
터미널 A:  npx pixel-agents          # 오피스 서버 + 웹뷰 (기존)
브라우저:  http://localhost:3100     # 빈 오피스
터미널 B:  OPENROUTER_API_KEY=... node driver/dist/index.js
           → 김대리/박사원/이주임 캐릭터가 등장
           → 각자 OpenRouter 호출하며 책상에서 일하기 시작
           → 터미널 B에 한국어 업무 로그가 실시간으로 흐름
```

---

## 7. 단계 계획

### 1단계 — PoC (서버 무수정)

- [ ] `driver/` 스캐폴딩, OpenRouter 클라이언트, server.json 읽기
- [ ] 에이전트 1명: JSONL로 등장 → 훅으로 read/write/rest 행동 → 캐릭터 움직임 확인
- [ ] action enum + 한국어 템플릿 매핑, 한국어 로그
- [ ] N명으로 확장 (각자 다른 모델)
- [ ] 검증: 터미널 한국어 로그 ↔ 오피스 캐릭터 동작 1:1 대응

### 2단계 — Provider 승격 (서버 수정)

- [ ] `server/src/providers/hook/openrouter/` provider 추가 (normalizeHookEvent 등)
- [ ] 서버가 훅 SessionStart만으로 `hooksOnly` 캐릭터 생성 (JSONL 의존 제거)
- [ ] provider 레지스트리 등록, `POST /api/hooks/openrouter` 사용
- [ ] AsyncAPI/테스트 정합성 확인

### 3단계 — 실제 작업화 (선택)

- [ ] `actions.ts`의 read/write/run을 실제 파일 작업으로 교체
- [ ] 에이전트 간 협업/메시지(팀) 등 확장

---

## 8. 미결정 / 리스크

| 항목               | 메모                                                                            |
| ------------------ | ------------------------------------------------------------------------------- |
| OpenRouter 모델 ID | 예시일 뿐, 실제 가용 SLM 확인 후 교체                                           |
| JSON mode 지원     | 일부 SLM은 strict JSON mode 미지원 → 프롬프트 강제 + 파싱 폴백 필요             |
| 캐릭터 생성 방식   | 1단계 JSONL 채택 / 2단계 훅-only. 1단계는 cwd 매칭 또는 Watch All Sessions 필요 |
| 비용               | 작은 모델 + 루프 주기(1~2초+) 조절로 호출량 관리                                |
| 레이트리밋         | OpenRouter 429 시 백오프 → 캐릭터는 "대기" 상태로                               |

---

## 9. 검증 기준 (Done의 정의)

1. 터미널 B에서 `node driver` 실행 → 오피스에 N개 캐릭터 등장.
2. 각 캐릭터가 책상으로 걸어가 타이핑/읽기 애니메이션을 반복.
3. 터미널 B에 **한국어 업무 로그**가 흐르고, 그 내용이 화면 동작과 일치.
4. Claude Code(`claude` 프로세스)는 **전혀 실행되지 않음**.
5. 에이전트마다 다른 OpenRouter 모델이 붙어 동작.
