// PART 10 핵심 사용자 흐름 브라우저 E2E (Playwright). API(:4000) + WEB(:3000) 실행 상태에서 사용.
// 사용: node e2e/core-flow.mjs   (DB 조작에 psql 사용: PGURL 환경변수)
import { createRequire } from 'module';
import { execSync } from 'child_process';
import { mkdirSync, writeFileSync } from 'fs';
const require = createRequire(import.meta.url);
const { chromium, devices } = require('playwright');
import { adminWithMfa } from './lib.mjs';

const WEB = process.env.WEB || 'http://localhost:3000';
const PGURL = process.env.PGURL || 'postgresql://plit:plit@localhost:5432/plit_dev';
const OUT = process.env.SHOTS || 'e2e/screenshots';
mkdirSync(OUT, { recursive: true });
const sql = (q) => execSync(`psql "${PGURL}" -tAc "${q.replace(/"/g, '\\"')}"`).toString().trim();
const step = (n, msg) => console.log(`✓ [${n}] ${msg}`);
const email = `e2e${Date.now()}@test.plit`;

const browser = await chromium.launch();
const pages = [];
const _newContext = browser.newContext.bind(browser);
browser.newContext = async (...a) => { const c = await _newContext(...a); const _np = c.newPage.bind(c); c.newPage = async () => { const pg = await _np(); pages.push(pg); return pg; }; return c; };
try {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => { console.error('PAGE ERROR', e); process.exitCode = 1; });

  // 1. 회원가입
  await page.goto(`${WEB}/signup`);
  await page.getByLabel('이메일').fill(email);
  await page.getByLabel(/비밀번호/).fill('abcd1234');
  await page.getByLabel(/닉네임/).fill('이투이');
  await page.getByLabel('전체 동의').check();
  await page.getByRole('button', { name: '가입하기' }).click();
  await page.waitForURL((u) => u.pathname === '/finder');
  await page.getByText('3,500P').first().waitFor();
  step(1, '회원가입 + 로그인 상태 유지 + 가입축하 3,500P');

  // 2. 관심 자격증 검색
  await page.getByLabel('자격증 검색').fill('산업안전');
  await page.getByRole('button', { name: '검색' }).click();
  await page.getByRole('heading', { name: '산업안전기사' }).waitFor();
  await page.getByRole('button', { name: '산업안전기사 관심 저장' }).click();
  await page.getByRole('button', { name: '산업안전기사 관심 해제' }).waitFor();
  await page.screenshot({ path: `${OUT}/02-finder.png` });
  step(2, '자격증 검색 + 관심 저장');

  // 3. 챌린지 선택
  await page.getByRole('link', { name: /챌린지 보기/ }).first().click();
  await page.getByRole('heading', { name: '산업안전기사 챌린지' }).waitFor();
  await page.screenshot({ path: `${OUT}/03-challenge.png`, fullPage: true });
  step(3, '챌린지 상세');

  // 4~6. 유료 참여 → 테스트 결제 → 권한 자동 부여
  await page.getByRole('button', { name: '부스터 패스 구매' }).click();
  await page.getByText('29,000원').first().waitFor();
  await page.screenshot({ path: `${OUT}/05-checkout.png` });
  await page.getByRole('button', { name: /테스트 결제$/ }).click();
  await page.waitForURL('**/dashboard/**');
  await page.getByText('플릿 부스터 패스').first().waitFor();
  const enrollmentId = page.url().split('/dashboard/')[1].split('?')[0];
  const plan = sql(`SELECT plan FROM "Enrollment" WHERE id='${enrollmentId}'`);
  if (plan !== 'PREMIUM') throw new Error('PREMIUM 권한 미부여: ' + plan);
  step('4-6', `테스트 결제 승인 → 패스 발급 → PREMIUM 참여 (${enrollmentId})`);

  // 8. 학습 기록 (타이머 시작 → 25분 경과 상황을 DB 로 재현 → 완료)
  await page.getByRole('button', { name: '공부 시작' }).click();
  await page.getByRole('button', { name: '일시정지' }).waitFor();
  sql(`UPDATE "StudySession" SET "resumedAt" = now() - interval '25 minutes' WHERE "enrollmentId"='${enrollmentId}' AND status='RUNNING'`);
  await page.getByRole('button', { name: '공부 완료' }).click();
  await page.getByText(/Mission CLEAR! 25분 기록/).waitFor();
  await page.getByText(/진도 0.4%/).waitFor();
  await page.screenshot({ path: `${OUT}/08-dashboard.png`, fullPage: true });
  step('8-9', '공부 25분 기록 + PLIT 도전 지표(추정) 표시');

  // 10. 시험 응시 후 합격 인증 (시험일 경과를 DB 로 재현)
  sql(`UPDATE "ChallengeOffering" SET "examDate" = now() - interval '1 day' WHERE id = (SELECT "offeringId" FROM "Enrollment" WHERE id='${enrollmentId}')`);
  await page.goto(`${WEB}/verify/${enrollmentId}`);
  await page.getByLabel('수험번호').fill('2027-1234-5678');
  const png = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex');
  writeFileSync('/tmp/plit-e2e-pass.png', png);
  await page.getByLabel(/성적 확인서/).setInputFiles('/tmp/plit-e2e-pass.png');
  await page.getByRole('button', { name: '결과 제출' }).click();
  await page.getByText('결과를 제출했어요').waitFor();
  step(10, '합격 증빙 업로드 + 제출');

  // 11. 관리자 승인 (별도 브라우저 컨텍스트)
  const admin = await (await browser.newContext()).newPage();
  await adminWithMfa(admin, WEB); // 스테이징 설정: 관리자 MFA 필수
  const row = admin.locator('li', { hasText: '이투이' });
  await row.getByRole('button', { name: '승인' }).click();
  await admin.getByText(/처리 완료: APPROVED · 20,000P 지급/).waitFor();
  await admin.screenshot({ path: `${OUT}/11-admin.png`, fullPage: true });
  step(11, '관리자 MFA 로그인 → 합격 승인');

  // 12~13. 보상 포인트 + 이력
  await page.goto(`${WEB}/my/points`);
  await page.locator('p.card', { hasText: '잔액 23,500P' }).waitFor();
  await page.getByText(/산업안전기사 .*합격 승인/).waitFor();
  await page.screenshot({ path: `${OUT}/13-points.png`, fullPage: true });
  const audit = sql(`SELECT count(*) FROM "AdminAuditLog" WHERE action='VERIFICATION_APPROVE'`);
  step('12-13', `보상 20,000P 원장 반영 → 잔액 23,500P, 감사 로그 ${audit}건`);

  // 모바일 반응형
  const m = await (await browser.newContext({ ...devices['iPhone 13'] })).newPage();
  for (const [name, path] of [['home', '/'], ['finder', '/finder']]) {
    await m.goto(WEB + path); await m.waitForLoadState('networkidle');
    const overflow = await m.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    if (overflow) throw new Error(`모바일 가로 스크롤 발생: ${path}`);
    await m.screenshot({ path: `${OUT}/mobile-${name}.png`, fullPage: true });
  }
  step('M', '모바일(iPhone 13) 가로 넘침 없음');
  console.log('CORE FLOW PASSED');
} catch (e) {
  console.error('CORE FLOW FAILED:', e.message.split('\n')[0]);
  for (const [i, pg] of pages.entries()) { try { await pg.screenshot({ path: `${OUT}/FAIL-${i}.png`, fullPage: true }); console.error(`--- page ${i} ${pg.url()}\n` + (await pg.locator('main').innerText()).slice(0, 300)); } catch {} }
  process.exitCode = 1;
} finally {
  await browser.close();
}
