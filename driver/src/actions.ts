import type { ActionKind, AgentStep } from './types.js';

/**
 * 행동(action) → 오피스가 이해하는 Claude 훅 tool_name + tool_input + 한국어 문구.
 *
 * 한국어 변환은 드라이버 쪽 고정 템플릿이다 (작은 모델 안정성). 모델은 reason만 생성하고,
 * 나머지 문구·이모지는 여기서 조립한다. tool_input은 서버의 formatToolStatus가
 * "Reading config.ts" 같은 라벨을 만들 수 있도록 채워 준다.
 */

export interface ToolMapping {
  /** Claude 훅 페이로드의 tool_name. rest는 도구가 아니라 턴 종료(Stop). */
  toolName: string | null;
  toolInput: Record<string, unknown>;
  /** 터미널에 찍을 한국어 한 줄 (이모지 포함). */
  log: string;
}

const VALID_ACTIONS: ReadonlySet<ActionKind> = new Set(['read', 'write', 'run', 'rest']);

/** 모델이 뱉은 action 문자열을 4종 enum으로 검증. 벗어나면 rest로 폴백. */
export function coerceAction(value: unknown): ActionKind {
  return typeof value === 'string' && VALID_ACTIONS.has(value as ActionKind)
    ? (value as ActionKind)
    : 'rest';
}

export function mapAction(step: AgentStep): ToolMapping {
  const target = step.target?.trim() || '';
  const reason = step.reason?.trim() || '';
  const because = reason ? ` ${reason}` : '';

  switch (step.action) {
    case 'read':
      return {
        toolName: 'Read',
        toolInput: { file_path: target || 'notes.md' },
        log: `📖 ${target || '자료'} 를 살펴보고 있어요.${because}`,
      };
    case 'write':
      return {
        toolName: 'Edit',
        toolInput: { file_path: target || 'draft.md' },
        log: `✏️ ${target || '문서'} 를 작성/수정하는 중이에요.${because}`,
      };
    case 'run':
      return {
        toolName: 'Bash',
        toolInput: { command: target || 'process' },
        log: `⚙️ ${target || '작업'} 을 실행하고 있어요.${because}`,
      };
    case 'rest':
    default:
      return {
        toolName: null,
        toolInput: {},
        log: `☕ 한 박자 쉬어갑니다.${because}`,
      };
  }
}
