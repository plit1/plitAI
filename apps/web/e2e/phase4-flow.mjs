// Phase 4 브라우저 E2E: QUICK TEST · AI 학습전략/코칭(키 없음 → 기본 코칭) · 권한 · 스터디룸 실시간 채팅 · 커뮤니티 · 신고 처리
import { createRequire } from 'module';
import { mkdirSync } from 'fs';
import { adminWithMfa } from './lib.mjs';
const require = createRequire(import.meta.url);
const { chromium, devices } = require('playwright');

const WEB = process.env.WEB || 'http://localhost:3000';
const OUT = process.env.SHOTS || 'e2e/screenshots';
const ROOM = 'industrial-safety-2027-1';
mkdirSync(OUT, { recursive: true });
const step = (n, m) => console.log(`✓ [${n}] ${m}`);
const stamp = Date.now();

const browser = await chromium.launch();
const pages = [];
const newPage = async (opts) => { const p = await (await browser.newContext(opts)).newPage(); pages.push(p); p.on('pageerror', (e) => { console.error('PAGE ERROR', e.message); process.exitCode = 1; }); p.on('dialog', (d) => d.accept(p.__answer ?? undefined)); return p; };
async function signup(page, email, nick) {
  await page.goto(`${WEB}/signup`);
  await page.getByLabel('이메일').fill(email); await page.getByLabel(/비밀번호/).fill('abcd1234'); await page.getByLabel(/닉네임/).fill(nick);
  await page.getByLabel('전체 동의').check(); await page.getByRole('button', { name: '가입하기' }).click(); await page.waitForURL((u) => u.pathname === '/finder');
}
try {
  // 1. A: 부스터 패스 결제 → 대시보드
  const a = await newPage();
  await signup(a, `p4a${stamp}@test.plit`, '부스터A');
  await a.goto(`${WEB}/challenges/${ROOM}`);
  await a.getByRole('button', { name: '부스터 패스 구매' }).click();
  await a.getByRole('button', { name: /테스트 결제$/ }).click();
  await a.waitForURL('**/dashboard/**');
  const enrA = a.url().split('/dashboard/')[1].split('?')[0];
  step(1, '회원 A 부스터 패스 결제 → 대시보드');

  // 2. QUICK TEST (예시 문항 고지 → 20문항 응답 → 채점)
  await a.getByRole('link', { name: /QUICK TEST/ }).click();
  await a.getByText('공식 기출 문제가 아닌 예시 문항이에요.').waitFor();
  const qs = a.locator('ol > li fieldset');
  const n = await qs.count();
  for (let i = 0; i < n; i++) await qs.nth(i).locator('input[type=radio]').first().check();
  await a.getByRole('button', { name: '제출하기' }).click();
  await a.getByRole('region', { name: '채점 결과' }).waitFor();
  const acc = await a.getByRole('region', { name: '채점 결과' }).locator('p').first().innerText();
  await a.screenshot({ path: `${OUT}/p4-quiz.png`, fullPage: true });
  step(2, `QUICK TEST ${n}문항 서버 채점 → ${acc.split('\n')[0]}`);

  // 3. AI 학습전략 적용 + 코칭(키 없음 → 기본 코칭)
  await a.goto(`${WEB}/strategy/${enrA}`);
  await a.getByRole('button', { name: '이 계획 적용하기' }).click();
  await a.getByText('AI 학습계획을 오늘 미션에 반영했어요.').waitFor();
  await a.getByRole('button', { name: '최신 계획 적용됨' }).waitFor();
  await a.getByRole('button', { name: '코칭 받기' }).click();
  await a.getByText('기본 코칭', { exact: true }).waitFor();
  await a.getByText(/오늘은 \d+분을 목표로 해봐요/).waitFor();
  await a.screenshot({ path: `${OUT}/p4-strategy.png`, fullPage: true });
  step(3, '학습전략 적용 → 코칭 (API 키 없음 → 규칙 기반 기본 코칭으로 폴백)');

  // 4. B: 플릿런 참여 → 프리미엄 기능 서버 차단
  const b = await newPage();
  await signup(b, `p4b${stamp}@test.plit`, '런B');
  await b.goto(`${WEB}/challenges/${ROOM}`);
  await b.getByRole('button', { name: '무료로 참여' }).click();
  await b.waitForURL('**/dashboard/**');
  const enrB = b.url().split('/dashboard/')[1].split('?')[0];
  await b.goto(`${WEB}/quiz/${enrB}`);
  await b.getByText('플릿 부스터 패스 전용 기능이에요.').waitFor();
  await b.goto(`${WEB}/strategy/${enrB}`);
  await b.getByText('플릿 부스터 패스 전용 기능이에요.').waitFor();
  step(4, '플릿런 회원 QUICK TEST·AI 전략 접근 → 서버 403 안내');

  // 5. 스터디룸 실시간 채팅 (A → B 즉시 수신), 연락처 차단
  await a.goto(`${WEB}/study-room/${ROOM}`); await b.goto(`${WEB}/study-room/${ROOM}`);
  await a.getByText('실시간 연결됨').waitFor(); await b.getByText('실시간 연결됨').waitFor();
  await a.getByLabel('메시지').fill('오늘 인간공학 같이 끝내요!');
  await a.getByRole('button', { name: '보내기' }).click();
  await b.getByText('오늘 인간공학 같이 끝내요!').waitFor({ timeout: 5000 });
  await b.getByLabel('메시지').fill('제 카톡 아이디로 연락주세요');
  await b.getByRole('button', { name: '보내기' }).click();
  await b.getByText(/개인 연락처는 올릴 수 없어요/).waitFor();
  await b.screenshot({ path: `${OUT}/p4-study-room.png`, fullPage: true });
  step(5, '스터디룸 실시간 전달(A→B) + 연락처 메시지 서버 차단');

  // 6. 스터디룸 글: 공개 고지 확인 → 전체 커뮤니티 노출
  await a.getByRole('tab', { name: '게시판' }).click();
  await a.getByLabel('제목').fill(`인간공학 정리 노트 ${stamp % 1000}`);
  await a.getByLabel('내용').fill('근골격계 부담작업 11가지를 표로 정리했어요.');
  if (!(await a.getByRole('button', { name: '글 올리기' }).isDisabled())) throw new Error('공개 고지 확인 전에 글쓰기가 가능함');
  await a.getByText('플릿 전체 커뮤니티에도 공개됩니다').click();
  await a.getByRole('button', { name: '글 올리기' }).click();
  await a.getByRole('link', { name: /인간공학 정리 노트/ }).waitFor();
  await b.goto(`${WEB}/community`);
  await b.getByRole('link', { name: /인간공학 정리 노트/ }).getByText('스터디룸 작성').waitFor();
  step(6, '공개 고지 확인 후 스터디룸 글 → 전체 커뮤니티 노출(스터디룸 작성 표시)');

  // 7. 커뮤니티: B 좋아요·댓글, A 가 B 댓글 신고 → 관리자 숨김
  await b.getByRole('link', { name: /인간공학 정리 노트/ }).click();
  await b.getByRole('button', { name: '좋아요 0' }).click();
  await b.getByRole('button', { name: '좋아요 1' }).waitFor();
  await b.getByLabel('댓글 입력').fill('정리 감사합니다! 저도 보고 갈게요');
  await b.getByRole('button', { name: '등록' }).click();
  await b.getByText('정리 감사합니다! 저도 보고 갈게요').waitFor();
  const postUrl = b.url();
  await a.goto(postUrl);
  a.__answer = '주제와 무관';
  await a.locator('li', { hasText: '정리 감사합니다' }).getByRole('button', { name: '신고' }).click();
  await a.getByText('신고가 접수됐어요').waitFor();
  const adm = await newPage();
  await adminWithMfa(adm, WEB);
  await adm.goto(`${WEB}/admin/reports`);
  await adm.locator('li', { hasText: '정리 감사합니다' }).getByRole('button', { name: '숨김' }).click();
  await adm.getByText(/댓글 숨김 · 신고 1건 처리/).waitFor();
  const c = await newPage();
  await c.goto(postUrl);
  await c.getByRole('heading', { name: /인간공학 정리 노트/ }).waitFor();
  if (await c.getByText('정리 감사합니다! 저도 보고 갈게요').count()) throw new Error('숨김 처리된 댓글이 보임');
  step(7, '좋아요·댓글 → 신고 → 관리자(MFA) 숨김 → 다른 사용자 화면에서 사라짐');

  // 8. 관리자 문항·AI 사용량 화면
  await adm.goto(`${WEB}/admin/quiz-items`);
  await adm.getByText('예시 문항').first().waitFor();
  await adm.goto(`${WEB}/admin`);
  await adm.getByText(/AI 코칭 \(최근 30일\)/).waitFor();
  step(8, '관리자 문항 은행(예시 문항 표시)·AI 사용량 화면');

  // 모바일
  const m = await newPage({ ...devices['iPhone 13'] });
  for (const p of ['/community', postUrl.replace(WEB, '')]) {
    await m.goto(WEB + p); await m.waitForLoadState('networkidle');
    if (await m.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)) throw new Error(`모바일 가로 넘침: ${p}`);
  }
  await m.goto(`${WEB}/community`); await m.screenshot({ path: `${OUT}/p4-mobile-community.png`, fullPage: true });
  step('M', '모바일 커뮤니티 목록·상세 가로 넘침 없음');
  console.log('PHASE4 FLOW PASSED');
} catch (e) {
  console.error('PHASE4 FLOW FAILED:', e.message.split('\n')[0]); process.exitCode = 1;
  for (const [i, pg] of pages.entries()) { try { await pg.screenshot({ path: `${OUT}/FAIL4-${i}.png`, fullPage: true }); console.error(`--- page ${i} ${pg.url()}\n` + (await pg.locator('main').innerText()).slice(0, 300)); } catch {} }
} finally { await browser.close(); }
