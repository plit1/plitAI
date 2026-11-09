// Phase 6 브라우저 E2E: 학습 → 경쟁(집계 중) → 메이트 입양·꾸미기 → 취업(보유 자격증·맞춤 공고·관심) → 창업(추천 업종·프로필·로드맵·자금·파트너) → 관리자 공고/지원사업
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
const newPage = async (opts) => { const p = await (await browser.newContext(opts)).newPage(); p.on('pageerror', (e) => { console.error('PAGE ERROR', e.message); process.exitCode = 1; }); p.on('dialog', (d) => d.accept()); return p; };
try {
  const u = await newPage();
  await u.goto(`${WEB}/signup`); await u.waitForLoadState('networkidle');
  await u.getByLabel('이메일').fill(`p6${stamp}@test.plit`); await u.getByLabel(/비밀번호/).fill('abcd1234'); await u.getByLabel(/닉네임/).fill('네일러');
  await u.getByLabel('전체 동의').check(); await u.getByRole('button', { name: '가입하기' }).click(); await u.waitForURL((x) => x.pathname === '/finder');

  // 1. 네일 챌린지 무료 참여 → 공부 기록 → 같은 회차 비교는 표본 부족으로 '집계 중'
  await u.goto(`${WEB}/challenges/nail-2027-1`);
  await u.getByRole('button', { name: '무료로 참여' }).click();
  await u.waitForURL('**/dashboard/**');
  const enr = u.url().split('/dashboard/')[1].split('?')[0];
  await u.getByRole('button', { name: '공부 시작' }).click();
  await u.getByRole('button', { name: '일시정지' }).waitFor();
  sql(`UPDATE "StudySession" SET "resumedAt" = now() - interval '25 minutes' WHERE "enrollmentId"='${enr}' AND status='RUNNING'`);
  await u.getByRole('button', { name: '공부 완료' }).click();
  await u.getByText(/Mission CLEAR! 25분 기록 · \+\d+XP/).waitFor();
  await u.getByTestId('comparison').getByText('집계 중').waitFor();
  await u.screenshot({ path: `${OUT}/p6-dashboard.png`, fullPage: true });
  step(1, '공부 25분 → XP 지급, 같은 회차 비교 표본 부족 → 집계 중');

  // 2. 메이트 입양 → 이름 변경 → 종류 변경 → 프리미엄 코스튬 잠금(FREE)
  await u.goto(`${WEB}/my/mate`);
  await u.getByLabel('이름 (선택)').fill('콩이');
  await u.getByRole('button', { name: /고양이/ }).click();
  await u.getByRole('heading', { name: '콩이' }).waitFor();
  await u.getByText(/누적 \d+XP/).waitFor();
  const xp = Number(sql(`SELECT COALESCE(SUM("deltaXp"),0) FROM "XpLedgerEntry" e JOIN "User" x ON x.id=e."userId" WHERE x.email='p6${stamp}@test.plit'`));
  if (!(xp > 0)) throw new Error('XP 원장 비어 있음');
  await u.getByLabel('새 이름').fill('콩떡');
  await u.getByRole('button', { name: '이름 변경' }).click();
  await u.getByRole('heading', { name: '콩떡' }).waitFor();
  await u.getByRole('button', { name: /강아지/ }).click();
  await u.getByRole('button', { name: /강아지/, pressed: true }).waitFor();
  if (!(await u.getByRole('button', { name: /골드 크라운/ }).isDisabled())) throw new Error('FREE 사용자에게 프리미엄 코스튬이 열림');
  await u.getByRole('button', { name: '스터디 머플러' }).click();
  await u.getByRole('button', { name: '스터디 머플러', pressed: true }).waitFor();
  await u.getByText('★ 첫 공부').waitFor();
  await u.screenshot({ path: `${OUT}/p6-mate.png`, fullPage: true });
  step(2, `메이트 입양·이름·종류·코스튬 변경, 프리미엄 코스튬 잠금, 배지 '첫 공부' (XP ${xp})`);

  // 3. 취업: 준비 중 자격증 표시 → 전기기사 보유 등록 → 맞춤 공고 → 관심 저장
  await u.goto(`${WEB}/jobs/settings`);
  await u.getByRole('listitem').filter({ hasText: '미용사(네일)' }).getByText('준비 중').waitFor();
  await u.getByLabel('보유 자격증 추가').selectOption({ label: '전기기사' });
  await u.getByRole('button', { name: '추가', exact: true }).first().click();
  await u.getByText('보유(본인 입력)').waitFor();
  await u.getByRole('button', { name: '경기' }).click();
  await u.getByRole('button', { name: '저장' }).click();
  await u.getByText('저장했어요. 맞춤 공고에 바로 반영돼요.').waitFor();
  await u.goto(`${WEB}/jobs`);
  const rec = u.getByRole('region', { name: /내 자격증 맞춤 공고/ });
  await rec.getByTestId('job-card').first().waitFor();
  const recCount = await rec.getByTestId('job-card').count();
  await rec.getByTestId('job-card').first().click();
  await u.waitForURL('**/jobs/**');
  await u.getByText('맞춤 이유 (참고용)').waitFor();
  await u.getByText('시연용 가상 공고예요').waitFor();
  await u.getByRole('button', { name: '☆ 관심 공고 저장' }).click();
  await u.getByRole('button', { name: '★ 관심 공고 해제' }).waitFor();
  await u.goto(`${WEB}/jobs/saved`);
  await u.getByTestId('job-card').first().waitFor();
  await u.goto(`${WEB}/jobs/cert/electric`);
  await u.getByRole('heading', { name: '전기기사 관련 공고' }).waitFor();
  await u.getByTestId('job-card').first().waitFor();
  step(3, `취업: 보유 자격증 등록 → 맞춤 공고 ${recCount}건 → 상세 맞춤 이유·데모 고지 → 관심 저장, 자격증별 공고`);

  // 4. 창업: 네일 자격증 → 추천 업종 네일숍 → 경기 수원 준비 단계 저장 → 맞춤 지원사업 → 로드맵 2단계 → 지역 재단 강조
  await u.goto(`${WEB}/startup`);
  await u.getByText('자격증 기반 추천 업종:').waitFor();
  await u.getByText('네일숍', { exact: true }).first().waitFor();
  await u.getByLabel('시·도').selectOption('경기');
  await u.getByLabel('시·군·구').fill('수원시');
  await u.getByRole('button', { name: '준비', exact: true }).click();
  await u.getByRole('button', { name: '저장' }).click();
  await u.getByText('저장했어요. 지원사업 맞춤도에 반영돼요.').waitFor();
  await u.getByText('네일숍 창업 전 확인할 것').waitFor();
  await u.getByTestId('program-card').first().waitFor();
  await u.screenshot({ path: `${OUT}/p6-startup.png`, fullPage: true });
  await u.goto(`${WEB}/startup/roadmap`);
  await u.getByLabel(/목표 업종·지역 설정/).check();
  await u.getByTestId('roadmap-progress').getByText('1/6 단계 완료').waitFor();
  await u.getByLabel(/^2\./).check();
  await u.getByTestId('roadmap-progress').getByText('2/6 단계 완료').waitFor();
  const saved = sql(`SELECT roadmap::text FROM "StartupProfile" p JOIN "User" x ON x.id=p."userId" WHERE x.email='p6${stamp}@test.plit'`);
  if (!saved.includes('"goal": true')) throw new Error('로드맵 DB 미저장: ' + saved);
  await u.goto(`${WEB}/startup/programs`);
  await u.getByTestId('program-card').first().click();
  await u.getByRole('button', { name: '☆ 관심 사업 저장' }).click();
  await u.getByRole('button', { name: '★ 관심 해제' }).waitFor();
  await u.goto(`${WEB}/startup/funds`);
  await u.getByText('경기 · 내 지역').waitFor();
  await u.goto(`${WEB}/startup/partners`);
  await u.getByRole('note').getByText('예시').waitFor();
  step(4, '창업: 추천 업종(네일숍) → 프로필 저장 → 맞춤 지원사업 → 로드맵 2/6 DB 저장 → 관심 사업 → 지역 재단 강조 → 파트너 예시 고지');

  // 5. 관리자: 지원사업 등록(원문 https) → 사용자 목록 노출 → 숨김, 취업 공고·공급자 상태
  const a = await newPage();
  await adminWithMfa(a, WEB);
  await a.goto(`${WEB}/admin/startup`);
  await a.getByText('K-Startup 사업공고 (공공데이터포털)').waitFor();
  await a.getByLabel('사업명').fill(`E2E 운영 지원사업 ${stamp}`);
  await a.getByLabel('기관').fill('테스트 재단');
  await a.getByLabel('원문 공고 링크 (https 필수)').fill('http://insecure.example');
  await a.getByLabel('신청 자격').fill('예비창업자'); await a.getByLabel('요약').fill('E2E 요약');
  await a.getByRole('button', { name: '등록' }).click();
  await a.getByText('원문 공고 링크(https)를 입력해주세요.').waitFor();
  await a.getByLabel('원문 공고 링크 (https 필수)').fill('https://example.com/program');
  await a.getByRole('button', { name: '등록' }).click();
  await a.getByText('지원사업을 등록했어요.').waitFor();
  const pid = sql(`SELECT id FROM "StartupProgram" WHERE title='E2E 운영 지원사업 ${stamp}'`);
  await u.goto(`${WEB}/startup/programs/${pid}`);
  await u.getByRole('link', { name: '원문 공고 보기 ↗' }).waitFor();
  await a.getByRole('row', { name: new RegExp(`E2E 운영 지원사업 ${stamp}`) }).getByRole('button', { name: '숨김' }).click();
  await a.getByText('상태를 바꿨어요.').waitFor();
  await u.reload();
  await u.getByRole('alert').filter({ hasText: '지원사업' }).waitFor();
  const audits = sql(`SELECT count(*) FROM "AdminAuditLog" WHERE action IN ('PROGRAM_CREATE','PROGRAM_STATUS')`);
  if (audits !== '2') throw new Error('감사 로그 누락: ' + audits);
  await a.goto(`${WEB}/admin/jobs`);
  await a.getByText('고용24 OPEN-API').waitFor();
  await a.getByText('NOT_CONFIGURED').first().waitFor();
  await a.screenshot({ path: `${OUT}/p6-admin-jobs.png`, fullPage: true });
  step(5, '관리자: 지원사업 http 거부 → https 등록 → 사용자 노출 → 숨김(404) · 감사 로그 2건, 고용24 미설정 표시');

  // 6. 모바일 레이아웃
  const m = await newPage({ ...devices['iPhone 13'] });
  await m.goto(`${WEB}/jobs`);
  await m.getByTestId('job-card').first().waitFor();
  const overflow = await m.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  if (overflow) throw new Error('모바일 가로 스크롤 발생');
  await m.screenshot({ path: `${OUT}/p6-mobile-jobs.png`, fullPage: true });
  step(6, '모바일(iPhone 13) 취업 목록 — 가로 스크롤 없음');
  console.log('PHASE 6 E2E PASSED');
} catch (e) {
  console.error('FAILED:', e.message); process.exitCode = 1;
} finally { await browser.close(); }
