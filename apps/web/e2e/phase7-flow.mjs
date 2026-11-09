// Phase 7 브라우저 E2E: 친구 초대(링크→가입→첫 학습→관리자 승인·중복 의심 해제) → 알림 → 포인트몰 교환·쿠폰·관리자 취소 → 광고 피드·신청·유효 DB 승인
import { createRequire } from 'module';
import { execSync } from 'child_process';
import { mkdirSync } from 'fs';
import { adminWithMfa } from './lib.mjs';
const require = createRequire(import.meta.url);
const { chromium, devices } = require('playwright');

const WEB = process.env.WEB || 'http://localhost:3000';
const OUT = process.env.SHOTS || 'e2e/screenshots';
const PGURL = process.env.PGURL;
const sql = (q) => execSync(`psql "${PGURL}" -tAc "${q.replace(/"/g, '\\"')}"`).toString().trim();
mkdirSync(OUT, { recursive: true });
const step = (n, m) => console.log(`✓ [${n}] ${m}`);
const stamp = Date.now();

const browser = await chromium.launch();
const newPage = async (opts) => { const p = await (await browser.newContext(opts)).newPage(); p.on('pageerror', (e) => { console.error('PAGE ERROR', e.message); process.exitCode = 1; }); p.on('dialog', (d) => d.accept(p.__answer ?? undefined)); return p; };
async function signup(page, email, nick, url = `${WEB}/signup`) {
  await page.goto(url); await page.waitForLoadState('networkidle');
  await page.getByLabel('이메일').fill(email); await page.getByLabel(/비밀번호/).fill('abcd1234'); await page.getByLabel(/닉네임/).fill(nick);
  await page.getByLabel('전체 동의').check(); await page.getByRole('button', { name: '가입하기' }).click(); await page.waitForURL((u) => u.pathname === '/finder');
}
async function joinAndStudy(page, email) {
  await page.goto(`${WEB}/challenges/industrial-safety-2027-1`);
  await page.getByRole('button', { name: '무료로 참여' }).click();
  await page.waitForURL('**/dashboard/**');
  const enr = page.url().split('/dashboard/')[1].split('?')[0];
  await page.getByRole('button', { name: '공부 시작' }).click();
  await page.getByRole('button', { name: '일시정지' }).waitFor();
  sql(`UPDATE "StudySession" SET "resumedAt" = now() - interval '5 minutes' WHERE "enrollmentId"='${enr}' AND status='RUNNING'`);
  await page.getByRole('button', { name: '공부 완료' }).click();
  await page.getByText(/Mission CLEAR!/).waitFor();
}
const pointsOf = (email) => Number(sql(`SELECT a.balance FROM "PointAccount" a JOIN "User" u ON u.id=a."userId" WHERE u.email='${email}'`));
try {
  // 1. 추천인 A: 챌린지 참여 → 초대 링크
  const a = await newPage(); const aEmail = `p7a${stamp}@test.plit`;
  await signup(a, aEmail, '초대왕');
  await a.goto(`${WEB}/referral`);
  await a.getByText('챌린지에 참여 중인 회원만').waitFor();
  await joinAndStudy(a, aEmail);
  await a.goto(`${WEB}/referral`);
  const link = await a.getByRole('textbox', { name: '초대 링크' }).inputValue();
  const code = link.split('/invite/')[1];
  step(1, `추천인: 참여 전 초대 불가 안내 → 참여 후 초대 링크 (${code})`);

  // 2. 친구 B: 초대 랜딩 → 코드 채워진 가입 → 첫 학습
  const b = await newPage(); const bEmail = `p7b${stamp}@test.plit`;
  await b.goto(`${WEB}/invite/${code}`);
  await b.getByText(/초\*+ 님이 PLIT 에 초대했어요/).waitFor();
  await b.getByRole('link', { name: '가입하고 시작하기' }).click();
  await b.waitForURL((u) => u.pathname === '/signup');
  await b.waitForLoadState('networkidle');
  if ((await b.getByLabel('추천 코드 (선택)').inputValue()) !== code) throw new Error('추천 코드 미리 채움 실패');
  await b.getByLabel('이메일').fill(bEmail); await b.getByLabel(/비밀번호/).fill('abcd1234'); await b.getByLabel(/닉네임/).fill('친구비');
  await b.getByLabel('전체 동의').check(); await b.getByRole('button', { name: '가입하기' }).click(); await b.waitForURL((u) => u.pathname === '/finder');
  if (sql(`SELECT count(*) FROM "ReferralReward" r JOIN "User" u ON u.id=r."refereeId" WHERE u.email='${bEmail}'`) !== '0') throw new Error('가입만으로 보상 생성됨');
  await joinAndStudy(b, bEmail);
  if (sql(`SELECT r.status FROM "ReferralReward" r JOIN "User" u ON u.id=r."refereeId" WHERE u.email='${bEmail}'`) !== 'PENDING') throw new Error('승인 대기 보상 없음');
  await a.goto(`${WEB}/referral`);
  await a.getByText('보상 확인 중').waitFor();
  step(2, '친구: 초대 랜딩(마스킹 닉네임) → 코드 자동 입력 가입 → 가입만으론 보상 없음 → 첫 학습 후 승인 대기');

  // 3. 관리자: 같은 PC(같은 IP)라 중복 의심 → 확인 근거 입력 후 승인
  const adm = await newPage();
  await adminWithMfa(adm, WEB);
  await adm.goto(`${WEB}/admin/referral`);
  const row = adm.getByRole('row', { name: /초대왕/ });
  await row.getByText('중복 의심').waitFor();
  adm.__answer = 'E2E 테스트 환경 — 같은 PC 확인';
  await row.getByRole('button', { name: '확인 후 승인' }).click();
  await adm.getByText('처리했어요.').waitFor();
  if (pointsOf(aEmail) !== 4500) throw new Error('추천인 포인트 불일치: ' + pointsOf(aEmail));
  step(3, '관리자: 중복 의심 표시 → 근거 입력 후 승인 → 추천인 3,500P + 1,000P = 4,500P');

  // 4. 알림: 종 아이콘 미읽음 → 알림센터 → 눌러서 이동·읽음
  await a.goto(`${WEB}/my`);
  await a.getByTestId('unread-count').waitFor();
  await a.getByRole('link', { name: /알림 \d+개 읽지 않음/ }).click();
  await a.getByText('친구 초대 보상 1,000P가 적립됐어요').click();
  await a.waitForURL((u) => u.pathname === '/referral');
  await a.getByText(/보상 지급/).waitFor();
  await a.screenshot({ path: `${OUT}/p7-referral.png`, fullPage: true });
  step(4, '알림: 미읽음 표시 → 알림 눌러 초대 화면 이동 → 보상 지급 표시');

  // 5. 포인트몰: 부족 표시 → (관리자 조정으로 재현) 교환 → 테스트 쿠폰 → 내 쿠폰
  await a.goto(`${WEB}/mall`);
  await a.getByText('테스트 쿠폰이 발급되며 실제 매장에서 사용할 수 없어요').waitFor();
  const cafe = a.getByTestId('product').filter({ hasText: '아메리카노 + 쿠키 세트' });
  await cafe.getByRole('button', { name: /500P 부족/ }).waitFor();
  const uid = sql(`SELECT id FROM "User" WHERE email='${aEmail}'`);
  sql(`WITH acc AS (UPDATE "PointAccount" SET balance = balance + 10000, version = version + 1 WHERE "userId"='${uid}' RETURNING balance) INSERT INTO "PointLedgerEntry" (id,"userId",type,amount,"balanceAfter",reason,"dedupeKey","isVirtual","createdAt") SELECT 'e2e-adj-${stamp}','${uid}','ADJUST',10000,balance,'E2E 테스트 조정','e2e-adj:${stamp}',true,now() FROM acc`);
  await a.reload();
  await cafe.getByRole('button', { name: '교환하기' }).click();
  await a.getByRole('dialog').getByText('교환 후 잔액').waitFor();
  await a.getByRole('button', { name: '5,000P 교환하기' }).click();
  const coupon = await a.getByTestId('coupon-code').innerText();
  if (!/^TEST-[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/.test(coupon)) throw new Error('쿠폰 형식: ' + coupon);
  await a.screenshot({ path: `${OUT}/p7-mall.png` });
  if (pointsOf(aEmail) !== 9500) throw new Error('교환 후 잔액 불일치: ' + pointsOf(aEmail));
  await a.getByRole('link', { name: '내 쿠폰 보기' }).click();
  await a.getByRole('button', { name: '코드 보기' }).click();
  await a.getByText(coupon).waitFor();
  step(5, `포인트몰: 부족 표시 → 교환 → 테스트 쿠폰 ${coupon.slice(0, 9)}… (14,500→9,500P) → 내 쿠폰 코드 보기`);

  // 6. 관리자 취소 → 포인트 복구
  await adm.goto(`${WEB}/admin/mall`);
  adm.__answer = 'E2E 고객 요청';
  await adm.getByRole('row', { name: /아메리카노/ }).getByRole('button', { name: '취소' }).click();
  await adm.getByText('교환을 취소했어요.').waitFor();
  if (pointsOf(aEmail) !== 14500) throw new Error('취소 후 잔액 불일치: ' + pointsOf(aEmail));
  await a.goto(`${WEB}/mall/coupons`);
  await a.getByText('취소 · 포인트 복구').waitFor();
  step(6, '관리자 교환 취소(사유) → 5,000P 복구 → 내 쿠폰에 취소 표시');

  // 7. 광고: 자격증 찾기 4장마다 광고 → 노출·클릭 → 상담 신청(연락처 없음) → 관리자 유효 승인 → 매출
  await b.goto(`${WEB}/finder`);
  const ad = b.getByTestId('ad-card').first();
  await ad.scrollIntoViewIfNeeded();
  await b.waitForTimeout(800);
  const idx = await b.locator('ul[aria-label^="검색 결과"] > li').evaluateAll((els) => els.findIndex((e) => e.querySelector('[data-testid="ad-card"]')));
  if (idx !== 4) throw new Error('첫 광고 위치가 5번째가 아님: ' + idx);
  await ad.click();
  await b.waitForURL('**/ads/**');
  await b.getByRole('note').getByText('예시 광고예요').waitFor();
  await b.getByText('이 광고는 연락처를 받지 않아요.').waitFor();
  await b.getByLabel('상담 주제').selectOption({ index: 1 });
  await b.getByLabel(/개인정보 수집·이용에 동의/).check();
  await b.getByRole('button', { name: '신청하기' }).click();
  await b.getByText('예시 광고라 실제 상담 연결은 없어요.').waitFor();
  const ev = sql(`SELECT string_agg("eventType", ',' ORDER BY "eventType") FROM (SELECT DISTINCT "eventType" FROM "AdEvent") t`);
  if (!['CLICK', 'FORM_START', 'IMPRESSION', 'SUBMIT'].every((t) => ev.includes(t))) throw new Error('광고 이벤트 누락: ' + ev);
  await adm.goto(`${WEB}/admin/ads`);
  await adm.getByRole('button', { name: '유효 승인' }).first().click();
  await adm.getByText('처리했어요.').waitFor();
  await adm.getByText(/인정 매출 .*30,000원/).waitFor();
  await adm.screenshot({ path: `${OUT}/p7-admin-ads.png`, fullPage: true });
  step(7, `광고: 4장 뒤 광고 카드 → 노출·클릭·폼시작·신청 이벤트(${ev}) → 예시 광고 고지 → 관리자 유효 승인 → 인정 매출 30,000원`);

  // 8. 모바일
  const m = await newPage({ ...devices['iPhone 13'] });
  await m.goto(`${WEB}/mall`);
  await m.getByTestId('product').first().waitFor();
  if (await m.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)) throw new Error('모바일 가로 스크롤');
  await m.screenshot({ path: `${OUT}/p7-mobile-mall.png`, fullPage: true });
  step(8, '모바일(iPhone 13) 포인트몰 — 가로 스크롤 없음');
  console.log('PHASE 7 E2E PASSED');
} catch (e) {
  console.error('FAILED:', e.message); process.exitCode = 1;
} finally { await browser.close(); }
