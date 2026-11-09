/** 게이미피케이션 규칙 (데모 v2.9 GX_POLICY 이관) — 순수 함수. XP 는 경제적 가치가 없는 별도 원장. */
export const GX = {
  stages: [
    { key: 'BABY', level: 1, label: '아기', minXp: 0 },
    { key: 'CHILD', level: 2, label: '어린이', minXp: 100 },
    { key: 'TEEN', level: 3, label: '청소년', minXp: 300 },
    { key: 'ADULT', level: 4, label: '어른', minXp: 650 },
    { key: 'CLEAR_MASTER', level: 5, label: '클리어 마스터', minXp: 1100 },
  ],
  masterMinClears: 1, nameMax: 12, defaultName: '나의 메이트',
  condition: { goodH: 24, tiredH: 48, sleepyH: 72 },
  weeklyWinXp: 50,
};
export const COSMETICS = [
  { id: 'none', label: '기본', premium: false }, { id: 'scarf', label: '스터디 머플러', premium: false }, { id: 'cap', label: '러닝 캡', premium: false },
  { id: 'crown', label: '골드 크라운', premium: true }, { id: 'aurora', label: '오로라 배경', premium: true },
];
const BANNED = ['시발', '씨발', '병신', '개새', '좆', '섹스', 'fuck', 'shit', 'bitch', 'sex', 'admin', '운영자'];

/** 데모 gxStageForXp: 5단계는 합격(clear) 1회 이상 필요 */
export function stageForXp(totalXp: number, clears: number) {
  let level = 1;
  for (const s of GX.stages) if (totalXp >= s.minXp) level = s.level;
  if (level === 5 && clears < GX.masterMinClears) level = 4;
  return level;
}
export const stageMeta = (level: number) => GX.stages[Math.max(1, Math.min(5, level)) - 1];

/** 데모 gxXpProgress */
export function xpProgress(totalXp: number, level: number) {
  const cur = stageMeta(level), next = GX.stages[level] ?? null;
  if (!next) return { from: cur.minXp, to: null, pct: 100, toNext: 0, lockedByClear: false };
  return {
    from: cur.minXp, to: next.minXp, toNext: Math.max(0, next.minXp - totalXp),
    pct: Math.max(0, Math.min(100, Math.round(((totalXp - cur.minXp) / (next.minXp - cur.minXp)) * 100))),
    lockedByClear: level === 4 && totalXp >= next.minXp, // XP 는 충분하나 합격 인증 필요
  };
}

/** 데모 gxValidatePetName */
export function validatePetName(raw: unknown): { ok: true; name: string } | { ok: false; message: string } {
  const t = String(raw ?? '').replace(/\s+/g, ' ').trim();
  if (!t) return { ok: false, message: '이름을 입력해주세요.' };
  if (t.length > GX.nameMax) return { ok: false, message: `${GX.nameMax}자 이내로 입력해주세요.` };
  if (!/^[가-힣a-zA-Z0-9 ]+$/.test(t)) return { ok: false, message: '한글·영문·숫자만 사용할 수 있어요.' };
  const n = t.replace(/\s/g, '').toLowerCase();
  return BANNED.some((w) => n.includes(w)) ? { ok: false, message: '사용할 수 없는 표현이 포함돼 있어요.' } : { ok: true, name: t };
}

/** 데모 gxDeriveCondition: 마지막 공부 후 경과 시간 */
export function deriveCondition(lastStudyAt: Date | null, now: Date, todayGoalMet: boolean) {
  const LABEL = { GREAT: ['최고', '오늘 목표를 채웠어요. 컨디션 최고!'], GOOD: ['좋음', '같이 공부할 준비가 됐어요.'], TIRED: ['피곤', '이틀째 쉬는 중이에요. 15분만 같이 해요.'], SLEEPY: ['졸림', '꾸벅꾸벅… 공부를 시작하면 바로 깨어나요.'] } as const;
  const h = lastStudyAt ? Math.max(0, (now.getTime() - lastStudyAt.getTime()) / 3600_000) : null;
  const c = GX.condition;
  const key: keyof typeof LABEL = h === null ? 'GOOD' : h < c.goodH ? (todayGoalMet ? 'GREAT' : 'GOOD') : h < c.tiredH ? 'GOOD' : h < c.sleepyH ? 'TIRED' : 'SLEEPY';
  return { key, label: LABEL[key][0], message: LABEL[key][1], hoursSince: h === null ? null : Math.floor(h) };
}

/** 배지 (데모 6종 + 주간 WIN) — XP 원장 출처와 레벨에서 파생 */
export function badges(sources: Set<string>, level: number) {
  return [
    { id: 'first-study', label: '첫 공부', done: sources.has('study') },
    { id: 'first-test', label: '첫 실력 점검', done: sources.has('test') },
    { id: 'streak-7', label: '7일 Streak', done: sources.has('streak') },
    { id: 'first-evolve', label: '첫 진화', done: level >= 2 },
    { id: 'clear', label: '합격 CLEAR', done: sources.has('clear') },
    { id: 'clear-master', label: 'CLEAR MASTER', done: level === 5 },
    { id: 'weekly-win', label: '주간 WIN', done: sources.has('weekly') },
  ];
}

/** 칭호: 획득한 것 중 가장 높은 단계 (데모에 없음 — 마스터 프롬프트 요구로 추가, 경제적 가치 없음) */
export function titleFor(level: number, earned: string[]) {
  if (earned.includes('clear-master')) return '클리어 마스터';
  if (earned.includes('clear')) return '합격 챌린저';
  if (earned.includes('weekly-win')) return '주간 승부사';
  if (earned.includes('streak-7')) return '꾸준한 러너';
  return `${stageMeta(level).label} 메이트`;
}

/** ISO 주차 키 (KST) — 주간 보상 중복 방지 */
export function isoWeek(d: Date) {
  const k = new Date(d.getTime() + 9 * 3600_000);
  const day = (k.getUTCDay() + 6) % 7;
  k.setUTCDate(k.getUTCDate() - day + 3);
  const firstThu = new Date(Date.UTC(k.getUTCFullYear(), 0, 4));
  const week = 1 + Math.round(((k.getTime() - firstThu.getTime()) / 86400000 - 3 + ((firstThu.getUTCDay() + 6) % 7)) / 7);
  return `${k.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}
