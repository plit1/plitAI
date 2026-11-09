// E2E 공통: TOTP 계산, 관리자 로그인(필요 시 MFA 등록)
import { createHmac } from 'crypto';
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
export function totp(secret, offset = 0) {
  let bits = 0, v = 0; const out = [];
  for (const c of secret.replace(/\s/g, '')) { v = (v << 5) | B32.indexOf(c); bits += 5; if (bits >= 8) { out.push((v >>> (bits - 8)) & 255); bits -= 8; } }
  const msg = Buffer.alloc(8); msg.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000) + offset));
  const h = createHmac('sha1', Buffer.from(out)).update(msg).digest(); const o = h[19] & 15;
  return String((((h[o] & 127) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3]) % 1e6).padStart(6, '0');
}
export async function login(page, web, email, password, next) {
  await page.goto(`${web}/login?next=${next}`);
  await page.getByLabel('이메일').fill(email); await page.getByLabel('비밀번호').fill(password);
  await page.getByRole('button', { name: '로그인' }).click();
}
/** 새 DB 의 시드 관리자: MFA 미등록 → 등록 → 재로그인(OTP). 반환: TOTP 시크릿 */
export async function adminWithMfa(page, web, email = 'admin@plit.local', password = 'PlitAdmin123!') {
  await login(page, web, email, password, '/my/account');
  await page.waitForURL((u) => u.pathname === '/my/account');
  await page.getByRole('button', { name: '설정' }).click();
  const secret = (await page.getByLabel('설정 키').innerText()).replace(/\s/g, '');
  await page.getByPlaceholder('앱에 표시된 6자리').fill(totp(secret));
  await page.getByRole('button', { name: '확인' }).click();
  await page.getByText('2단계 인증을 켰어요').waitFor();
  await page.getByRole('button', { name: '로그아웃' }).click();
  await login(page, web, email, password, '/admin');
  await page.getByLabel('인증 앱의 6자리 코드').fill(totp(secret, 1));
  await page.getByRole('button', { name: '인증하고 로그인' }).click();
  await page.waitForURL((u) => u.pathname === '/admin');
  return secret;
}
