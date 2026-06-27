import type { AgentDef } from './types.js';

// ── 슬라이드 제약 (제한 조건) — 코드 상수로 못박는다 ─────────────────────
/** 한 번 실행당 에이전트 LLM 호출 최대 횟수. */
export const MAX_LLM_CALLS_PER_RUN = 5;
/** 모든 호출의 temperature. */
export const TEMPERATURE = 0.2;
/** 입력(회의록=누적 단계 기록)은 1,000자 이하. */
export const MAX_CONTEXT_CHARS = 1000;
/** 각 에이전트 출력은 5줄 이하 — max_tokens로도 한 번 더 조인다. */
export const MAX_OUTPUT_LINES = 5;
export const MAX_OUTPUT_TOKENS = 160;

// ── 행동 1건의 화면 체류 시간 (작은 모델이라 실제 작업 대신 시간 흉내) ──
export const ACTION_DURATION_MS = 3000;
/** 단계 사이 짧은 호흡. */
export const STEP_GAP_MS = 1200;

// ── 에이전트 정원 ───────────────────────────────────────────────────────
// model은 반드시 슬라이드 "OpenRouter 호출 가능 API 목록"에서만 고른다 (그 외 AI 금지).
// task는 슬라이드 "업무 분해" 예시 결대로, 한 덩어리 업무를 준다.
export const AGENTS: AgentDef[] = [
  {
    name: '김대리',
    model: 'meta-llama/llama-4-maverick',
    task: '보조금 신청 처리',
  },
  {
    name: '박사원',
    model: 'mistralai/mistral-small-3.2-24b-instruct',
    task: '월간 운영 보고서 작성',
  },
  {
    name: '이주임',
    model: 'microsoft/phi-4',
    task: '고객 문의 대응 정리',
  },
];

// ── OpenRouter ──────────────────────────────────────────────────────────
export const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
