# 변경 기록 (OpenRouter 드라이버 — 1단계 PoC)

> 슬라이드 6번 "수정 & 변경 기록" 양식: [변경] 무엇을 / 이유: 왜.
> 서버(`server/`)·웹뷰(`webview-ui/`)·코어(`core/`)는 **한 줄도 수정하지 않음** (1단계 PoC 원칙: 서버 무수정).
> 모든 신규 코드는 독립 폴더 `driver/` 에만 추가.

## 신규 파일

- **[변경]** `driver/src/office.ts` 추가 / **이유:** `~/.pixel-agents/server.json`에서 포트·토큰을 읽고,
  검증된 Claude 훅 형식을 `POST /api/hooks/claude`로 보내 캐릭터를 등장·구동하기 위해. 서버를 고치는 대신
  기존 훅 입구를 그대로 재사용한다.
- **[변경]** `driver/src/agent.ts` 추가 / **이유:** 에이전트 한 명의 "업무 분해 루프"를 담기 위해.
  LLM 호출 1회 = 다음 한 단계 결정으로 구현(슬라이드 2 Decomposition), 최대 5단계(슬라이드 3 제약).
- **[변경]** `driver/src/openrouter.ts` 추가 / **이유:** OpenRouter(OpenAI 호환)로 다음 단계를 받아오기 위해.
  작은 모델 대비 strict JSON mode를 강요하지 않고 관대한 파싱 + `rest` 폴백.
- **[변경]** `driver/src/actions.ts` 추가 / **이유:** read/write/run/rest 행동을 오피스가 이해하는
  `tool_name`(Read/Edit/Bash/Stop)과 한국어 문구로 매핑하기 위해.
- **[변경]** `driver/src/config.ts` 추가 / **이유:** 슬라이드 "제한 조건"(호출 5회·temp 0.2·입력 1,000자·
  출력 5줄)과 에이전트 정원(OpenRouter 모델 ID 포함)을 한곳에 상수로 못박기 위해.
- **[변경]** `driver/src/logger.ts`, `driver/src/types.ts`, `driver/src/index.ts` 추가 / **이유:** 한국어 컬러
  로그, 공용 타입, 진입점(N명 동시 구동 + Ctrl+C 정리) 분리.
- **[변경]** `driver/package.json`, `tsconfig.json`, `.env.example`, `.gitignore`, `README.md` 추가 /
  **이유:** 독립 실행(tsx) + 설정/문서.

## 설계 결정 (왜 이렇게)

- **[변경]** 캐릭터 채택을 "최소 JSONL + SessionStart + 확인 이벤트(Stop)" 3단계로 / **이유:** 코드 추적 결과
  `hookEventHandler.ts`는 미지 세션의 SessionStart를 곧장 캐릭터로 만들지 않고 **pending**으로 두었다가,
  이어지는 확인 이벤트가 와야 `onExternalSessionDetected`로 채택한다 (`hookEventHandler.ts:234-286`).
  그래서 SessionStart 직후 Stop을 한 번 보내 캐릭터를 확정 등장시킨다.
- **[변경]** 서버를 `--providers claude`로 실행하도록 안내 / **이유:** 사용자의 이전 작업으로 기본 provider가
  `codex`가 됨. Claude 훅 스키마·`~/.claude/projects` JSONL 채택 경로를 쓰려면 claude를 enabled로 띄워야 한다.
- **[변경]** "한 번 실행당 5회" = 에이전트당 5단계로 해석 / **이유:** 원래 구상의 무한 루프와 슬라이드 5회 제약을
  동시에 만족시키기 위해. 한 번의 실행은 ≤5단계 업무 분해 후 대기로 끝난다.
- **[변경]** 에이전트별 "고정" 세션 ID(`stableSessionId`, workspace+이름 해시) 사용 / **이유:** 매 실행마다
  랜덤 ID를 쓰면 재실행 때마다 새 캐릭터가 생겨 이전 캐릭터들이 Idle로 누적·서성였다. 고정 ID로 바꿔
  재실행 시 같은 캐릭터가 다시 일하게 했다 (`office.ts`, `index.ts`).
