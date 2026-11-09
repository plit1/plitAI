// Phase 3 브라우저 E2E: 관리자 MFA 강제 → OTP 등록·로그인 → 정책 발행 → 오픈런(요청→승인→관심→목표 달성→회차 연결)
//  → 시험 일정 CSV → 계정 설정. API 는 NODE_ENV=staging (ADMIN_MFA_REQUIRED 기본 true) 로 실행할 것.
import { createRequire } from 'module';
import { login as loginAt, totp } from './lib.mjs';
import { mkdirSync } from 'fs';
const require = createRequire(import.meta.url);
const { chromium, devices } = require('playwright');

const WEB = process.env.WEB || 'http://localhost:3000';
const OUT = process.env.SHOTS || 'e2e/screenshots';
mkdirSync(OUT, { recursive: true });
const step = (n, m) => console.log(`✓ [${n}] ${m}`);
const login = (page, email, password, next) => loginAt(page, WEB, email, password, next);
async function signup(page, email, nick) {
  await page.goto(`${WEB}/signup`); await page.waitForLoadState('networkidle');
  await page.getByLabel('이메일').fill(email); await page.getByLabel(/비밀번호/).fill('abcd1234'); await page.getByLabel(/닉네임/).fill(nick);
  await page.getByLabel('전체 동의').check(); await page.getByRole('button', { name: '가입하기' }).click(); await page.waitForURL((u) => u.pathname === '/finder');
}

const browser = await chromium.launch();
const pages = [];
const _newContext = browser.newContext.bind(browser);
browser.newContext = async (...a) => { const c = await _newContext(...a); const _np = c.newPage.bind(c); c.newPage = async () => { const pg = await _np(); pages.push(pg); return pg; }; return c; };
try {
  const admin = await (await browser.newContext()).newPage();
  admin.on('pageerror', (e) => { console.error('PAGE ERROR', e.message); process.exitCode = 1; });
  admin.on('dialog', (d) => d.accept(admin.__answer?.shift?.() ?? undefined));
  const answer = (...a) => { admin.__answer = a; };

  // 1. MFA 미설정 관리자는 관리자 API 거부 → 설정 안내
  await login(admin, 'admin@plit.local', 'PlitAdmin123!', '/admin');
  await admin.waitForURL((u) => u.pathname === '/admin');
  await admin.getByText('2단계 인증(OTP) 로그인 후 이용할 수 있어요').first().waitFor();
  step(1, '관리자 MFA 미설정 → 관리자 API 403 + 설정 안내');

  // 2. OTP 등록 → 재로그인(OTP 단계) → 관리자 기능 허용
  await admin.getByRole('link', { name: '2단계 인증 설정하기' }).first().click();
  await admin.getByRole('button', { name: '설정' }).click();
  const secret = (await admin.getByLabel('설정 키').innerText()).replace(/\s/g, '');
  await admin.getByPlaceholder('앱에 표시된 6자리').fill(totp(secret));
  await admin.getByRole('button', { name: '확인' }).click();
  await admin.getByText('2단계 인증을 켰어요').waitFor();
  await admin.getByRole('button', { name: '로그아웃' }).click();
  await login(admin, 'admin@plit.local', 'PlitAdmin123!', '/admin');
  await admin.getByLabel('인증 앱의 6자리 코드').fill(totp(secret, 1));
  await admin.getByRole('button', { name: '인증하고 로그인' }).click();
  await admin.waitForURL((u) => u.pathname === '/admin');
  await admin.getByText('활성 회원').waitFor();
  step(2, 'TOTP 등록 → 비밀번호+OTP 로그인 → 관리자 대시보드');

  // 3. 정책 발행 (오픈런 목표 2명)
  await admin.goto(`${WEB}/admin/policy`);
  await admin.getByLabel(/오픈런 목표 인원/).fill('2');
  await admin.getByLabel(/새 정책 버전/).fill('2026-11-v3.0');
  await admin.getByRole('button', { name: '정책 발행' }).click();
  await admin.getByText('정책 2026-11-v3.0 발행 완료').waitFor();
  step(3, '정책 발행 (openRunTarget=2)');

  // 4. 회원 A 오픈런 요청 → 비공개 → 관리자 승인
  const a = await (await browser.newContext()).newPage();
  const stamp = Date.now();
  await signup(a, `orA${stamp}@test.plit`, '요청자A');
  await a.goto(`${WEB}/open-run`);
  await a.getByLabel('자격증 이름').fill('산업안전기사');
  await a.getByRole('button', { name: '개설 요청하기' }).click();
  await a.getByText(/이미 PLIT 에 있는 자격증이에요/).waitFor();
  await a.getByLabel('자격증 이름').fill('보세사');
  await a.getByLabel(/필요한 이유/).fill('무역 회사 취업 준비 중이에요');
  await a.getByRole('button', { name: '개설 요청하기' }).click();
  await a.getByText('요청을 등록했어요').waitFor();
  await a.getByText('검토 대기').waitFor();
  await admin.goto(`${WEB}/admin/open-run`);
  await admin.locator('li', { hasText: '보세사' }).getByRole('button', { name: '공개 승인' }).click();
  await admin.getByText('보세사: 모집 중').waitFor();
  step(4, '카탈로그 중복 안내 → 오픈런 요청 → 운영자 공개 승인');

  // 5. 회원 B 관심 → 목표 달성
  const b = await (await browser.newContext()).newPage();
  await signup(b, `orB${stamp}@test.plit`, '관심자B');
  await b.goto(`${WEB}/open-run`);
  await b.locator('li', { hasText: '보세사' }).getByRole('button', { name: '나도 필요해요' }).click();
  await b.locator('li', { hasText: '보세사' }).getByText('목표 달성 · 개설 심사 대기').waitFor();
  await b.locator('li', { hasText: '보세사' }).getByText('2 / 2명').waitFor();
  step(5, '다른 회원 관심 → 2/2명 목표 달성 (자동 개설 아님)');

  // 6. 회차 개설 → 요청에 연결
  const offeringId = `industrial-safety-e2e-${stamp}`.slice(0, 70);
  await admin.goto(`${WEB}/admin/offerings`);
  await admin.getByLabel('자격증').selectOption({ label: '산업안전기사' });
  await admin.getByLabel(/회차 ID/).fill(offeringId);
  await admin.getByLabel('회차명').fill('2027년 2회차');
  await admin.getByLabel('모집 마감일').fill('2027-03-01');
  await admin.getByLabel('시험일').fill('2027-05-01');
  await admin.getByRole('button', { name: '회차 개설' }).click();
  await admin.getByText(`회차 ${offeringId} 개설`).waitFor();
  await admin.goto(`${WEB}/admin/open-run`);
  answer(offeringId);
  await admin.locator('li', { hasText: '보세사' }).getByRole('button', { name: '회차 연결' }).click();
  await admin.getByText(/보세사: 개설됨 · 알림 대상 2명/).waitFor();
  step(6, '관리자 회차 개설 → 오픈런 회차 연결 (알림 대상 2명)');

  // 7. 시험 일정 CSV 미리보기·반영
  await admin.goto(`${WEB}/admin/exam-rounds`);
  await admin.getByLabel('CSV 내용').fill('certId,label,applyStart,applyEnd,examDate,resultDate\nindustrial-safety,2027년 1회,2027-01-10,2027-01-15,2027-02-20,2027-03-12\nbarista,2027년 1회,,,2027-03-01,');
  await admin.getByRole('button', { name: '미리보기' }).click();
  await admin.getByText(/미리보기 · 신규 2 · 수정 0 · 오류 0/).waitFor();
  await admin.getByRole('button', { name: '반영' }).click();
  await admin.getByText(/반영 완료 · 신규 2/).waitFor();
  await admin.locator('td', { hasText: '바리스타 2급' }).waitFor();
  await admin.screenshot({ path: `${OUT}/p3-exam-rounds.png`, fullPage: true });
  step(7, '시험 일정 CSV 미리보기 → 반영 → 목록');

  // 8. 감사 로그
  await admin.goto(`${WEB}/admin/audit`);
  for (const act of ['POLICY_PUBLISH', 'OPEN_RUN_APPROVE', 'OPEN_RUN_OPEN', 'OFFERING_CREATE', 'EXAM_ROUND_IMPORT']) await admin.getByText(act).first().waitFor();
  step(8, '감사 로그: 정책·오픈런·회차·일정 작업 기록');

  // 9. 회원 계정 설정 (선택 동의 토글)
  await a.goto(`${WEB}/my/account`);
  // 가입 시 '전체 동의'로 마케팅 동의 상태 → 철회 후 새로고침해도 유지되는지
  if (!(await a.getByLabel('이벤트·혜택 알림 수신').isChecked())) throw new Error('가입 시 선택 동의가 반영되지 않음');
  await a.getByLabel('이벤트·혜택 알림 수신').uncheck();
  await a.getByText('동의를 철회했어요.').waitFor();
  await a.reload();
  await a.getByLabel('이벤트·혜택 알림 수신').waitFor();
  if (await a.getByLabel('이벤트·혜택 알림 수신').isChecked()) throw new Error('동의 철회가 저장되지 않음');
  await a.screenshot({ path: `${OUT}/p3-account.png`, fullPage: true });
  step(9, '계정 설정: 가입 시 선택 동의 반영 → 철회 → 새로고침 후 유지');

  // 모바일
  const m = await (await browser.newContext({ ...devices['iPhone 13'] })).newPage();
  for (const p of ['/open-run', '/login']) {
    await m.goto(WEB + p); await m.waitForLoadState('networkidle');
    if (await m.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)) throw new Error(`모바일 가로 넘침: ${p}`);
  }
  await m.goto(`${WEB}/open-run`); await m.screenshot({ path: `${OUT}/p3-mobile-open-run.png`, fullPage: true });
  step('M', '모바일 오픈런·로그인 가로 넘침 없음');
  console.log('PHASE3 FLOW PASSED');
} catch (e) {
  console.error('PHASE3 FLOW FAILED:', e.message.split('\n')[0]);
  for (const [i, pg] of pages.entries()) { try { await pg.screenshot({ path: `${OUT}/FAIL-${i}.png`, fullPage: true }); console.error(`--- page ${i} ${pg.url()}\n` + (await pg.locator('main').innerText()).slice(0, 300)); } catch {} } process.exitCode = 1;
} finally { await browser.close(); }
