/** 한국어 컬러 로그. [이름] 이모지 설명 형태. */

const COLORS = [
  '\x1b[36m', // cyan
  '\x1b[33m', // yellow
  '\x1b[35m', // magenta
  '\x1b[32m', // green
  '\x1b[34m', // blue
  '\x1b[31m', // red
];
const DIM = '\x1b[2m';
const RESET = '\x1b[0m';

const colorByName = new Map<string, string>();

function colorFor(name: string): string {
  let c = colorByName.get(name);
  if (!c) {
    c = COLORS[colorByName.size % COLORS.length];
    colorByName.set(name, c);
  }
  return c;
}

/** 에이전트 한 명의 업무 로그 한 줄. */
export function agentLog(name: string, message: string): void {
  const c = colorFor(name);
  console.log(`${c}[${name}]${RESET} ${message}`);
}

/** 드라이버 전체의 시스템 로그(연결/시작/종료 등). */
export function sysLog(message: string): void {
  console.log(`${DIM}· ${message}${RESET}`);
}

export function errLog(message: string): void {
  console.error(`\x1b[31m✗ ${message}${RESET}`);
}
