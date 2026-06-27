/** 에이전트가 고를 수 있는 행동 — 작은 모델 안정화를 위해 4종 enum으로 제한. */
export type ActionKind = 'read' | 'write' | 'run' | 'rest';

/** LLM이 매 호출마다 결정하는 "다음 한 단계". */
export interface AgentStep {
  action: ActionKind;
  /** 대상 (파일/명령 등). 없으면 빈 문자열. */
  target: string;
  /** 한국어 한 줄 사유 — 유일하게 모델이 자유 생성하는 부분. */
  reason: string;
}

/** 한 에이전트(사무실 직원 한 명)의 정의. */
export interface AgentDef {
  /** 화면/로그에 보일 이름 (예: "김대리"). */
  name: string;
  /** OpenRouter 모델 ID — 슬라이드 "호출 가능 API 목록"에서만 고른다. */
  model: string;
  /** 이 직원이 단계로 분해해 수행할 업무 한 덩어리. */
  task: string;
}

/** 서버 디스커버리 파일(~/.pixel-agents/server.json)의 우리가 쓰는 필드. */
export interface ServerInfo {
  port: number;
  token: string;
}
