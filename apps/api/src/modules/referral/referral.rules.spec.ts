import { anon, checks, failReason, fingerprint, kstMonth, maskNickname } from './referral.rules';

const base = { referrerActive: true, referrerHasEnrollment: true, attributed: true, selfReferral: false, dupSuspect: false, enrollmentActive: true, hasValidStudy: true, alreadyRewarded: false, month: { count: 0, points: 0 }, limit: { count: 20, points: 20000 }, amount: 1000 };

describe('친구 초대 규칙', () => {
  it('9개 재검증 항목 모두 충족 시 통과', () => { expect(checks(base).every((c) => c.ok)).toBe(true); });
  it('월 한도: 건수 도달 또는 지급 후 포인트 초과면 실패', () => {
    expect(checks({ ...base, month: { count: 20, points: 0 } }).find((c) => c.key === 'limit')!.ok).toBe(false);
    expect(checks({ ...base, month: { count: 3, points: 19500 } }).find((c) => c.key === 'limit')!.ok).toBe(false);
    expect(checks({ ...base, month: { count: 3, points: 19000 } }).find((c) => c.key === 'limit')!.ok).toBe(true);
  });
  it('실패 사유 문구', () => {
    expect(failReason(checks({ ...base, dupSuspect: true, alreadyRewarded: true }))).toBe('중복 계정 의심 없음, 피추천인 평생 1회 미충족');
  });
  it('지문: 원문을 포함하지 않고 같은 값은 같은 지문, 비밀이 다르면 다름', () => {
    const a = fingerprint('1.2.3.4', 's1');
    expect(a).toHaveLength(32); expect(a).not.toContain('1.2.3.4');
    expect(fingerprint('1.2.3.4', 's1')).toBe(a); expect(fingerprint('1.2.3.4', 's2')).not.toBe(a);
    expect(fingerprint(undefined, 's1')).toBeNull();
  });
  it('익명화·마스킹·KST 월', () => {
    expect(anon('ckabc123XYZ')).toBe('user_••xyz');
    expect(maskNickname('김플릿')).toBe('김**'); expect(maskNickname('A')).toBe('*');
    expect(kstMonth(new Date('2026-11-30T15:30:00Z'))).toBe('2026-12');
  });
});
