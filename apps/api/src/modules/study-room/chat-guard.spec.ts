import { ChatGuard, SR_POLICY } from './chat-guard';

describe('ChatGuard (데모 SR_POLICY)', () => {
  let t = 1_000_000;
  const g = () => new ChatGuard(() => t);
  beforeEach(() => { t = 1_000_000; });

  it('정상 → 2초 안 재전송 RATE → 같은 내용 30초 안 DUPLICATE', () => {
    const c = g();
    expect(c.check('u', 'r', '안녕하세요')).toEqual({ ok: true, text: '안녕하세요' });
    t += 500; expect(c.check('u', 'r', '두 번째')).toMatchObject({ ok: false, code: 'RATE' });
    t += 2000; expect(c.check('u', 'r', '안녕하세요')).toMatchObject({ ok: false, code: 'DUPLICATE' });
    expect(c.check('u', 'r2', '안녕하세요').ok).toBe(true); // 다른 방은 중복 아님
  });
  it('30초에 5개까지 (BURST)', () => {
    const c = g();
    for (let i = 0; i < 5; i++) { expect(c.check('u', 'r', `메시지 ${i}`).ok).toBe(true); t += 2100; }
    expect(c.check('u', 'r', '여섯 번째')).toMatchObject({ ok: false, code: 'BURST' });
    t += SR_POLICY.burstWindowMs; expect(c.check('u', 'r', '다시 가능').ok).toBe(true);
  });
  it('필터 위반 3회 → 60초 쿨다운 (정상 문장도 차단), 빈 문자열은 위반 아님', () => {
    const c = g();
    expect(c.check('u', 'r', '   ')).toMatchObject({ code: 'EMPTY' });
    for (const bad of ['010-1111-2222', '씨발', 'www.spam.com']) { t += 100; expect(c.check('u', 'r', bad).ok).toBe(false); }
    t += 100; expect(c.check('u', 'r', '정상 문장')).toMatchObject({ ok: false, code: 'COOLDOWN' });
    t += SR_POLICY.cooldownMs; expect(c.check('u', 'r', '정상 문장').ok).toBe(true);
  });
  it('300자 초과 LENGTH, 사용자별 독립', () => {
    const c = g();
    expect(c.check('u', 'r', '가'.repeat(301))).toMatchObject({ code: 'LENGTH' });
    expect(c.check('a', 'r', '첫 메시지').ok).toBe(true);
    expect(c.check('b', 'r', '첫 메시지').ok).toBe(true);
  });
});
