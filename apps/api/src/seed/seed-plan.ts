/** 환경별 시드 범위 (D-038). 알 수 없는 NODE_ENV 는 가장 보수적으로(운영처럼) 취급 */
export function seedPlan(env: { NODE_ENV?: string; SEED_DEMO_CONTENT?: string; SEED_DEV_USERS?: string }) {
  const mode = env.NODE_ENV ?? 'development';
  const local = mode === 'development' || mode === 'test';
  const staging = mode === 'staging';
  return {
    mode,
    demoContent: (local || staging) && env.SEED_DEMO_CONTENT !== 'false',
    devUsers: local && env.SEED_DEV_USERS !== 'false', // 알려진 비밀번호 계정 — 외부 노출 환경(스테이징·운영) 금지
  };
}
