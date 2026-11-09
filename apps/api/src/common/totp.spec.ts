import { base32Decode, base32Encode, hotp, openSecret, sealSecret, verifyTotp } from './totp';

describe('TOTP (RFC 6238)', () => {
  // RFC 6238 부록 B 테스트 벡터 (SHA-1, 시크릿 "12345678901234567890") — 8자리 값의 뒤 6자리
  const secret = base32Encode(Buffer.from('12345678901234567890'));
  it.each([
    [59, '287082'], [1111111109, '081804'], [1111111111, '050471'], [1234567890, '005924'], [2000000000, '279037'],
  ])('t=%i → %s', (t, code) => {
    expect(hotp(secret, Math.floor(t / 30))).toBe(code);
  });

  it('base32 왕복', () => {
    const b = Buffer.from('hello plit');
    expect(base32Decode(base32Encode(b)).equals(b)).toBe(true);
  });

  it('±30초 허용, 그 밖은 거절, 형식 오류 거절', () => {
    const now = 1111111111 * 1000;
    expect(verifyTotp(secret, '050471', now)).toBe(Math.floor(1111111111 / 30));
    expect(verifyTotp(secret, '050471', now + 30_000)).not.toBeNull();
    expect(verifyTotp(secret, '050471', now + 90_000)).toBeNull();
    expect(verifyTotp(secret, '05047', now)).toBeNull();
    expect(verifyTotp(secret, 'abcdef', now)).toBeNull();
  });

  it('시크릿 암호화 왕복, 변조 시 복호화 실패', () => {
    const sealed = sealSecret('JBSWY3DPEHPK3PXP');
    expect(sealed).not.toContain('JBSWY3DPEHPK3PXP');
    expect(openSecret(sealed)).toBe('JBSWY3DPEHPK3PXP');
    const parts = sealed.split(':'); parts[3] = Buffer.from('tampered!!').toString('base64');
    expect(() => openSecret(parts.join(':'))).toThrow();
  });
});
