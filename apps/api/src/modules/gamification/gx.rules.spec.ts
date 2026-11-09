import { badges, deriveCondition, isoWeek, stageForXp, titleFor, validatePetName, xpProgress } from './gx.rules';

describe('게이미피케이션 규칙 (데모 GX 이관)', () => {
  it('단계: 0/100/300/650/1100, 5단계는 합격 1회 필요', () => {
    expect([0, 99, 100, 300, 650, 1100].map((x) => stageForXp(x, 1))).toEqual([1, 1, 2, 3, 4, 5]);
    expect(stageForXp(5000, 0)).toBe(4);
    expect(xpProgress(5000, 4)).toMatchObject({ lockedByClear: true, toNext: 0 });
    expect(xpProgress(200, 2)).toMatchObject({ from: 100, to: 300, pct: 50, toNext: 100 });
    expect(xpProgress(1200, 5)).toMatchObject({ to: null, pct: 100 });
  });
  it('이름: 12자·한글영문숫자·금칙어', () => {
    expect(validatePetName('  콩이  2호 ')).toEqual({ ok: true, name: '콩이 2호' });
    expect(validatePetName('')).toMatchObject({ ok: false });
    expect(validatePetName('가나다라마바사아자차카타파')).toMatchObject({ ok: false });
    expect(validatePetName('콩이!')).toMatchObject({ ok: false });
    expect(validatePetName('Admin냥')).toMatchObject({ ok: false });
  });
  it('컨디션: 24h 이내 GOOD(목표 달성 GREAT), 48h GOOD, 72h TIRED, 그 이후 SLEEPY, 기록 없음 GOOD', () => {
    const now = new Date('2026-11-09T12:00:00Z');
    const ago = (h: number) => new Date(now.getTime() - h * 3600_000);
    expect(deriveCondition(ago(2), now, true).key).toBe('GREAT');
    expect(deriveCondition(ago(2), now, false).key).toBe('GOOD');
    expect(deriveCondition(ago(30), now, true).key).toBe('GOOD');
    expect(deriveCondition(ago(50), now, false).key).toBe('TIRED');
    expect(deriveCondition(ago(80), now, false)).toMatchObject({ key: 'SLEEPY', hoursSince: 80 });
    expect(deriveCondition(null, now, false).key).toBe('GOOD');
  });
  it('배지·칭호', () => {
    const b = badges(new Set(['study', 'clear']), 3);
    expect(b.filter((x) => x.done).map((x) => x.id)).toEqual(['first-study', 'first-evolve', 'clear']);
    expect(titleFor(3, ['first-study', 'clear'])).toBe('합격 챌린저');
    expect(titleFor(2, [])).toBe('어린이 메이트');
  });
  it('ISO 주차 (KST)', () => {
    expect(isoWeek(new Date('2026-11-09T00:00:00+09:00'))).toBe('2026-W46'); // 월요일
    expect(isoWeek(new Date('2026-11-15T23:59:00+09:00'))).toBe('2026-W46'); // 일요일
    expect(isoWeek(new Date('2026-11-15T15:00:00Z'))).toBe('2026-W47'); // KST 월요일 0시
    expect(isoWeek(new Date('2027-01-01T12:00:00+09:00'))).toBe('2026-W53');
  });
});
