/** 서비스 기준 시간대는 Asia/Seoul. 날짜 비교는 KST 달력일 기준. */
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
export const kstDate = (d: Date = new Date()): string => new Date(d.getTime() + KST_OFFSET_MS).toISOString().slice(0, 10);
/** a → b 까지 남은 KST 달력일 수 (b가 미래면 양수) */
export const daysBetween = (a: Date, b: Date): number => {
  const da = Date.parse(kstDate(a) + 'T00:00:00Z');
  const db = Date.parse(kstDate(b) + 'T00:00:00Z');
  return Math.round((db - da) / 86400000);
};
export const addDays = (d: Date, n: number) => new Date(d.getTime() + n * 86400000);
