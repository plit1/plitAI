import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from 'crypto';

/** RFC 6238 TOTP (SHA-1, 30초, 6자리) — Google Authenticator·Microsoft Authenticator 호환 */
const STEP = 30;
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function base32Encode(buf: Buffer) {
  let bits = 0, value = 0, out = '';
  for (const b of buf) { value = (value << 8) | b; bits += 8; while (bits >= 5) { out += B32[(value >>> (bits - 5)) & 31]; bits -= 5; } }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}
export function base32Decode(s: string) {
  const clean = s.replace(/=+$/, '').toUpperCase();
  let bits = 0, value = 0; const out: number[] = [];
  for (const c of clean) { const i = B32.indexOf(c); if (i < 0) throw new Error('invalid base32'); value = (value << 5) | i; bits += 5; if (bits >= 8) { out.push((value >>> (bits - 8)) & 255); bits -= 8; } }
  return Buffer.from(out);
}

export const generateTotpSecret = () => base32Encode(randomBytes(20));
export const currentStep = (now = Date.now()) => Math.floor(now / 1000 / STEP);

export function hotp(secretB32: string, counter: number) {
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(counter));
  const h = createHmac('sha1', base32Decode(secretB32)).update(msg).digest();
  const off = h[h.length - 1] & 0xf;
  const code = ((h[off] & 0x7f) << 24) | (h[off + 1] << 16) | (h[off + 2] << 8) | h[off + 3];
  return String(code % 1_000_000).padStart(6, '0');
}

/** ±1 단계(±30초) 허용. 일치한 단계를 반환 → 호출자가 재사용(리플레이) 차단에 사용 */
export function verifyTotp(secretB32: string, code: string, now = Date.now(), window = 1): number | null {
  if (!/^\d{6}$/.test(code)) return null;
  const cur = currentStep(now);
  for (let d = -window; d <= window; d++) {
    const expected = Buffer.from(hotp(secretB32, cur + d));
    if (timingSafeEqual(expected, Buffer.from(code))) return cur + d;
  }
  return null;
}

export const otpauthUrl = (secret: string, account: string, issuer = 'PLIT') =>
  `otpauth://totp/${encodeURIComponent(`${issuer}:${account}`)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=${STEP}`;

/** 시크릿 저장용 AES-256-GCM. 키는 MFA_ENC_KEY(32바이트 hex/base64) — 없으면 JWT 시크릿에서 파생(개발용) */
function key() {
  const raw = process.env.MFA_ENC_KEY;
  if (raw) {
    const k = /^[0-9a-f]{64}$/i.test(raw) ? Buffer.from(raw, 'hex') : Buffer.from(raw, 'base64');
    if (k.length !== 32) throw new Error('MFA_ENC_KEY 는 32바이트여야 합니다.');
    return k;
  }
  return createHash('sha256').update(`mfa:${process.env.JWT_ACCESS_SECRET}`).digest();
}
export function sealSecret(plain: string) {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', key(), iv);
  const enc = Buffer.concat([c.update(plain, 'utf8'), c.final()]);
  return `v1:${iv.toString('base64')}:${c.getAuthTag().toString('base64')}:${enc.toString('base64')}`;
}
export function openSecret(sealed: string) {
  const [v, iv, tag, enc] = sealed.split(':');
  if (v !== 'v1') throw new Error('unknown secret format');
  const d = createDecipheriv('aes-256-gcm', key(), Buffer.from(iv, 'base64'));
  d.setAuthTag(Buffer.from(tag, 'base64'));
  return Buffer.concat([d.update(Buffer.from(enc, 'base64')), d.final()]).toString('utf8');
}
