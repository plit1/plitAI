// Phase 5 브라우저 E2E: 토스 리다이렉트(success/fail) 처리·금액 위변조 거절·환불·포인트 만료 예정·정산/CSV·증빙 열람(감사 로그)
// ※ 토스 위젯 자체(js.tosspayments.com)는 이 환경에서 차단 → 위젯이 리다이렉트하는 URL 로 직접 진입해 서버 승인 흐름을 검증 (MOCK PG)
import { createRequire } from 'module';
import { execSync } from 'child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'fs';
import { adminWithMfa } from './lib.mjs';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const WEB = process.env.WEB || 'http://localhost:3000';
const PGURL = process.env.PGURL || 'postgresql://plit:plit@localhost:5432/plit_dev';
const OUT = process.env.SHOTS || 'e2e/screenshots';
const ROOM = 'industrial-safety-2027-1';
mkdirSync(OUT, { recursive: true });
const sql = (q) => execSync(`psql "${PGURL}" -tAc "${q.replace(/"/g, '\\"')}"`).toString().trim();
const step = (n, m) => console.log(`✓ [${n}] ${m}`);
const stamp = Date.now();

const browser = await chromium.launch();
const pages = [];
const newPage = async (opts) => { const ctx = await browser.newContext({ acceptDownloads: true, ...opts }); const p = await ctx.newPage(); pages.push(p); p.on('pageerror', (e) => { console.error('PAGE ERROR', e.message); process.exitCode = 1; }); p.on('dialog', (d) => d.accept()); return p; };
try {
  const u = await newPage();
  await u.goto(`${WEB}/signup`); await u.waitForLoadState('networkidle');
  await u.getByLabel('이메일').fill(`p5${stamp}@test.plit`); await u.getByLabel(/비밀번호/).fill('abcd1234'); await u.getByLabel(/닉네임/).fill('결제5');
  await u.getByLabel('전체 동의').check(); await u.getByRole('button', { name: '가입하기' }).click(); await u.waitForURL((u) => u.pathname === '/finder');
  const userId = sql(`SELECT id FROM "User" WHERE email='p5${stamp}@test.plit'`);

  // 1. 주문 생성 (결제 화면 진입)
  await u.goto(`${WEB}/checkout/${ROOM}`);
  await u.getByText('29,000원').first().waitFor();
  const orderNo = (await u.locator('dd.font-mono').innerText()).trim();
  step(1, `결제 화면 → 서버 주문 생성 (${orderNo})`);

  // 2. 토스 successUrl 로 금액을 바꿔 진입 → 서버가 거절
  const success = (amount) => `${WEB}/checkout/success?offering=${ROOM}&paymentType=NORMAL&orderId=${orderNo}&paymentKey=mock_ok_${orderNo}&amount=${amount}`;
  await u.goto(success(100));
  await u.getByText('결제 금액이 주문 금액과 달라요.').waitFor();
  if (sql(`SELECT status FROM "Order" WHERE "orderNo"='${orderNo}'`) !== 'PENDING') throw new Error('위변조 금액으로 상태가 바뀜');
  step(2, 'successUrl 금액 위변조(100원) → 서버 거절, 주문 PENDING 유지');

  // 3. 정상 금액 → 승인·패스·부스터 참여 → 대시보드
  await u.goto(success(29000));
  await u.waitForURL('**/dashboard/**');
  await u.getByText('플릿 부스터 패스').first().waitFor();
  step(3, 'successUrl 정상 진입 → 서버 승인 → 패스 발급·부스터 참여');

  // 4. failUrl
  await u.goto(`${WEB}/checkout/fail?offering=${ROOM}&code=PAY_PROCESS_CANCELED&message=${encodeURIComponent('사용자에 의해 결제가 취소되었습니다.')}&orderId=X`);
  await u.getByText('사용자에 의해 결제가 취소되었습니다.').waitFor();
  await u.getByRole('link', { name: '다시 결제하기' }).waitFor();
  step(4, 'failUrl → 사유 안내·다시 결제 링크');

  // 5. 결제 내역 → 환불
  await u.goto(`${WEB}/my/orders`);
  await u.getByRole('button', { name: '환불 요청' }).click();
  await u.getByText('환불을 완료했어요.').waitFor();
  await u.getByText('환불 완료').waitFor();
  if (sql(`SELECT plan FROM "Enrollment" WHERE "userId"='${userId}'`) !== 'FREE') throw new Error('환불 후 플릿런 전환 안 됨');
  step(5, '결제 내역에서 환불 → 패스 회수·플릿런 전환');

  // 6. 포인트 만료 예정
  sql(`UPDATE "PointLedgerEntry" SET "expiresAt" = now() + interval '10 days' WHERE "userId"='${userId}' AND amount > 0`);
  await u.goto(`${WEB}/my/points`);
  await u.getByText(/30일 안에 3,500P가 만료돼요/).waitFor();
  await u.screenshot({ path: `${OUT}/p5-points.png`, fullPage: true });
  step(6, '포인트 만료 예정 안내 (30일 내 3,500P)');

  // 7. 합격 증빙 제출 (시험일 경과 재현)
  const enr = sql(`SELECT id FROM "Enrollment" WHERE "userId"='${userId}'`);
  sql(`UPDATE "ChallengeOffering" SET "examDate" = now() - interval '1 day' WHERE id='${ROOM}'`);
  writeFileSync('/tmp/plit-e2e-p5.png', Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex'));
  await u.goto(`${WEB}/verify/${enr}`);
  await u.getByLabel('수험번호').fill('2027-5555-1234');
  await u.getByLabel(/성적 확인서/).setInputFiles('/tmp/plit-e2e-p5.png');
  await u.getByRole('button', { name: '결과 제출' }).click();
  await u.getByText('결과를 제출했어요').waitFor();

  // 8. 관리자: 증빙 보기(감사 로그) → 정산(테스트 포함)·CSV
  const adm = await newPage();
  await adminWithMfa(adm, WEB);
  const [popup] = await Promise.all([adm.waitForEvent('popup'), adm.locator('li', { hasText: '결제5' }).getByRole('button', { name: '증빙 보기' }).click()]);
  if (!popup.url().startsWith('blob:')) throw new Error('증빙이 blob 으로 열리지 않음: ' + popup.url());
  const views = sql(`SELECT count(*) FROM "AdminAuditLog" WHERE action='EVIDENCE_VIEW'`);
  if (views !== '1') throw new Error('증빙 열람 감사 로그 없음: ' + views);
  step(7, '증빙 제출 → 관리자 증빙 보기(새 창) + 열람 감사 로그 1건');

  await adm.goto(`${WEB}/admin/settlement`);
  await adm.getByText('데이터가 없어요.').waitFor(); // 기본: 테스트 결제 제외
  await adm.getByLabel('테스트 결제 포함').check();
  await adm.getByRole('button', { name: '조회' }).click();
  await adm.getByText('1건 · 29,000원').first().waitFor();
  const [dl] = await Promise.all([adm.waitForEvent('download'), adm.getByRole('button', { name: 'CSV 다운로드' }).click()]);
  const csv = readFileSync(await dl.path(), 'utf8');
  if (!/합계,1,29000,1,29000,0,0,0/.test(csv)) throw new Error('CSV 합계 불일치: ' + csv.slice(-80));
  await adm.screenshot({ path: `${OUT}/p5-settlement.png`, fullPage: true });
  step(8, '정산: 테스트 결제 기본 제외 → 포함 시 결제 1·환불 1·순매출 0, CSV 합계 일치');
  console.log('PHASE5 FLOW PASSED');
} catch (e) {
  console.error('PHASE5 FLOW FAILED:', e.message.split('\n')[0]); process.exitCode = 1;
  for (const [i, pg] of pages.entries()) { try { await pg.screenshot({ path: `${OUT}/FAIL5-${i}.png`, fullPage: true }); console.error(`--- page ${i} ${pg.url()}\n` + (await pg.locator('main').innerText()).slice(0, 300)); } catch {} }
} finally { await browser.close(); }
