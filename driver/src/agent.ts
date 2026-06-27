import { mapAction } from './actions.js';
import {
  ACTION_DURATION_MS,
  MAX_CONTEXT_CHARS,
  MAX_LLM_CALLS_PER_RUN,
  STEP_GAP_MS,
} from './config.js';
import { agentLog, errLog } from './logger.js';
import type { OfficeClient } from './office.js';
import { decideNextStep, OpenRouterError } from './openrouter.js';
import type { AgentDef } from './types.js';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * 에이전트 한 명의 한 번 실행(run): 업무를 최대 MAX_LLM_CALLS_PER_RUN 단계로 분해해 수행한다.
 * 각 단계마다 LLM을 1회 호출(=다음 한 단계 결정)하고, 그 행동을 오피스 신호로 바꾼다.
 * 5단계를 채우거나 모델이 rest를 고르면 마무리(턴 종료=대기)한다.
 */
export async function runAgent(
  def: AgentDef,
  office: OfficeClient,
  apiKey: string,
  sessionId: string,
): Promise<void> {
  // 1) 등장: 트랜스크립트 + SessionStart, 이어서 Stop으로 pending 확정 → 캐릭터 생성.
  office.ensureTranscript(sessionId);
  await office.sessionStart(sessionId);
  await sleep(300); // 서버가 pending으로 저장할 짬
  await office.stop(sessionId); // 확인 이벤트 → 캐릭터가 대기 상태로 등장
  agentLog(def.name, `🪑 출근했습니다. 오늘 업무: "${def.task}" (모델 ${def.model})`);
  await sleep(STEP_GAP_MS);

  // 2) 업무 분해 루프 (최대 5 호출).
  let history = '';
  let step = 0;
  for (let call = 1; call <= MAX_LLM_CALLS_PER_RUN; call++) {
    let decided;
    try {
      decided = await decideNextStep({ apiKey, model: def.model, task: def.task, history });
    } catch (e) {
      const msg = e instanceof OpenRouterError ? e.message : String(e);
      agentLog(def.name, `🕒 호출이 막혀 잠시 대기합니다. (${msg})`);
      break;
    }

    if (decided.action === 'rest') {
      agentLog(def.name, `✅ 업무를 마무리합니다.${decided.reason ? ` ${decided.reason}` : ''}`);
      break;
    }

    step++;
    const mapping = mapAction(decided);
    agentLog(def.name, `(${step}단계) ${mapping.log}`);

    // 행동 시작 → 체류 → 종료
    if (mapping.toolName) {
      await office.toolStart(sessionId, mapping.toolName, mapping.toolInput);
      await sleep(ACTION_DURATION_MS);
      await office.toolEnd(sessionId);
    }

    // 회의록 누적 (1,000자 이하 유지)
    history =
      `${history}- ${step}단계: ${decided.action} ${decided.target} (${decided.reason})\n`.slice(
        -MAX_CONTEXT_CHARS,
      );
    await sleep(STEP_GAP_MS);
  }

  // 3) 턴 종료 → 대기. 캐릭터는 오피스에 남아 다음 지시를 기다린다.
  await office.stop(sessionId);
  agentLog(def.name, `☕ 자리에서 대기 중입니다.`);

  if (step === 0) {
    errLog(`${def.name}: 한 단계도 수행하지 못했습니다 (모델 응답/키 확인 필요).`);
  }
}
