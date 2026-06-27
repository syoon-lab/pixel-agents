import {
  MAX_CONTEXT_CHARS,
  MAX_OUTPUT_LINES,
  MAX_OUTPUT_TOKENS,
  OPENROUTER_URL,
  TEMPERATURE,
} from './config.js';
import { coerceAction } from './actions.js';
import type { AgentStep } from './types.js';

/**
 * OpenRouter(OpenAI 호환) 한 번 호출 → 다음 한 단계({action,target,reason})를 받아온다.
 *
 * 슬라이드 제약을 그대로 반영:
 *  - temperature 0.2
 *  - 입력(누적 단계 기록=회의록)은 1,000자 이하로 잘라 보냄
 *  - 출력은 5줄 이하 (max_tokens로도 조임)
 *  - 작은 모델 대비: strict JSON mode를 강요하지 않고 프롬프트 강제 + 관대한 파싱 + rest 폴백
 */

const SYSTEM_PROMPT = [
  '당신은 가상의 사무실 직원입니다.',
  '주어진 업무를 "거치는 단계"로 하나씩 분해해 수행합니다.',
  '매 호출마다 "다음 한 단계"만 결정하세요.',
  '가능한 행동은 정확히 4가지: read(자료 읽기) / write(문서 작성·수정) / run(작업 실행) / rest(마무리·휴식).',
  '반드시 JSON 한 줄로만 답하세요:',
  '{"action":"read|write|run|rest","target":"파일이나 대상","reason":"한국어 한 줄"}',
  `출력은 ${MAX_OUTPUT_LINES}줄 이하. 설명·코드블록 금지, JSON만.`,
].join(' ');

export class OpenRouterError extends Error {}

function extractJson(text: string): Record<string, unknown> | null {
  // 코드펜스/잡설을 무시하고 첫 번째 { ... } 블록만 뽑아 파싱.
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1 || end < start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export async function decideNextStep(opts: {
  apiKey: string;
  model: string;
  task: string;
  /** 지금까지 수행한 단계들을 사람이 읽는 형태로 누적한 "회의록". */
  history: string;
}): Promise<AgentStep> {
  const history = opts.history.slice(-MAX_CONTEXT_CHARS); // 1,000자 이하 보장
  const userPrompt =
    `업무: ${opts.task}\n` +
    `지금까지 거친 단계:\n${history || '(아직 없음)'}\n` +
    `다음 한 단계는 무엇인가요? 업무가 충분히 마무리됐다면 action을 "rest"로.`;

  let res: Response;
  try {
    res = await fetch(OPENROUTER_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${opts.apiKey}`,
        'HTTP-Referer': 'https://github.com/pixel-agents-hq/pixel-agents',
        'X-Title': 'Pixel Agents Driver',
      },
      body: JSON.stringify({
        model: opts.model,
        temperature: TEMPERATURE,
        max_tokens: MAX_OUTPUT_TOKENS,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userPrompt },
        ],
      }),
    });
  } catch (e) {
    throw new OpenRouterError(`네트워크 오류: ${e instanceof Error ? e.message : String(e)}`);
  }

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new OpenRouterError(`HTTP ${res.status} ${res.statusText} ${detail.slice(0, 200)}`);
  }

  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = data.choices?.[0]?.message?.content ?? '';
  const parsed = extractJson(content);

  // 파싱 실패 시 rest로 폴백 (작은 모델 안정화).
  return {
    action: coerceAction(parsed?.action),
    target: typeof parsed?.target === 'string' ? parsed.target : '',
    reason: typeof parsed?.reason === 'string' ? parsed.reason : '',
  };
}
