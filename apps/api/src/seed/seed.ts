/**
 * 시드 (dist/seed/seed.js 로 함께 빌드 — 컨테이너에서 `node dist/seed/seed.js` 실행 가능).
 * 데모 v2.9 의 자격증 50종(X5)과 회차 생성 규칙(Ys)을 그대로 재현한다.
 * - 운영(production): 자격증·회차·정책만. 데모 콘텐츠·개발 계정 금지
 * - 스테이징: + 데모 공고·지원사업·예시 문항 (SEED_DEMO_CONTENT=false 로 끔). 개발 계정은 만들지 않음
 * - 로컬·테스트: + 개발 계정(admin@plit.local)
 */
import { ChallengeType, Prisma, PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import raw from '../data/certifications.raw.json';
import demoQuiz from '../data/demo-quiz-items.json';
import demoJS from '../data/demo-jobs-startup.json';
import { DEFAULT_POLICY, DEFAULT_POLICY_VERSION } from '../modules/policy/policy.defaults';
import { seedPlan } from './seed-plan';

const prisma = new PrismaClient();
type Row = [string, string, string, string, ChallengeType, string, number, string, string];

const SUBJECTS: Record<ChallengeType, string[]> = {
  exam: ['핵심 이론', '법규·기준', '실무 응용', '기출 유형'],
  edu_exam: ['기초 이론', '실무 지식', '관련 법규', '실기 대비'],
  completion: ['필수 교과', '선택 교과', '현장 실습', '과제·평가'],
  score: ['Listening', 'Reading', '어휘·문법', '실전 모의'],
};
const SPECIAL_SUBJECTS: Record<string, string[]> = { 'industrial-safety': ['산업안전관리론', '인간공학', '기계위험방지', '전기위험방지'] };
const DURATION: Record<ChallengeType, number> = { exam: 56, edu_exam: 84, completion: 120, score: 56 };
// 데모의 결정적 의사난수 rc(i, k)
const rc = (i: number, k: number) => { const n = Math.sin(i * 9301 + k * 49297) * 233280; return n - Math.floor(n); };
const day = (base: Date, n: number) => new Date(base.getTime() + n * 86400000);

async function main() {
  const plan = seedPlan(process.env);
  console.log(`seed plan: ${JSON.stringify(plan)}`);
  const base = new Date(new Date().toISOString().slice(0, 10) + 'T15:00:00Z'); // KST 자정 기준일
  const rows = raw as Row[];
  for (const [i, [id, name, field, qualType, challengeType, issuer, difficulty, tagline, passRule]] of rows.entries()) {
    const subjects = SPECIAL_SUBJECTS[id] ?? SUBJECTS[challengeType];
    await prisma.certification.upsert({ where: { id }, create: { id, name, field, qualType, challengeType, issuer, difficulty, tagline, passRule, subjects }, update: { name, field, qualType, issuer, difficulty, tagline, passRule, subjects } });

    const r = 2 + Math.floor(rc(i, 1) * 26);
    let o: Prisma.ChallengeOfferingUncheckedCreateInput = {
      id: `${id}-2027-1`, certId: id, round: '2027년 1회차', recruitEnd: day(base, r), examDate: day(base, r + DURATION[challengeType]),
      durationDays: DURATION[challengeType], freeCap: 300, premiumCap: 300, status: 'open',
      popularity: Math.round((60 + Math.floor(rc(i, 2) * 220) + (20 + Math.floor(rc(i, 3) * 200)) * 1.4) * (1 + rc(i, 4))),
    };
    if (id === 'industrial-safety') o = { ...o, recruitEnd: day(base, 5), examDate: day(base, 61), durationDays: 56, popularity: 99999 };
    if (id === 'logistics') o = { ...o, status: 'closed', recruitEnd: day(base, -2) };
    // 정원 카운터는 실제 참여로만 증가 (데모의 가상 참가자 수는 시드하지 않음)
    await prisma.challengeOffering.upsert({ where: { id: o.id as string }, create: o, update: { round: o.round, recruitEnd: o.recruitEnd, examDate: o.examDate, status: o.status } });
  }

  await prisma.policyVersion.upsert({ where: { id: DEFAULT_POLICY_VERSION }, create: { id: DEFAULT_POLICY_VERSION, values: DEFAULT_POLICY as unknown as Prisma.InputJsonValue, isCurrent: true, createdBy: 'seed' }, update: {} });
  if (!(await prisma.policyVersion.findFirst({ where: { isCurrent: true } }))) await prisma.policyVersion.update({ where: { id: DEFAULT_POLICY_VERSION }, data: { isCurrent: true } });

  // 데모 v2.9 QUICK TEST 예시 20문항 (산업안전기사) — 공식 기출 아님, isSample 로 화면에 고지
  if (plan.demoContent && (await prisma.quizItem.count({ where: { isSample: true } })) === 0) {
    await prisma.quizItem.createMany({
      data: (demoQuiz as { subject: string; prompt: string; options: string[]; answer: number }[]).map((q) => ({
        certId: 'industrial-safety', subject: q.subject, prompt: q.prompt, options: q.options, answer: q.answer,
        source: 'PLIT 데모 예시 문항 (공식 기출 아님)', isSample: true, status: 'PUBLISHED' as const,
      })),
    });
  }

  // 데모 채용공고·지원사업 (가상 회사·기관, isDemo 표시) — 운영 DB 에는 넣지 않음
  if (plan.demoContent) {
    type JobRow = [string, string, string, string, string, string, string | null, string[], string[], string[], string | null, number, number, string];
    for (const [id, co, title, loc, emp, exp, edu, req, pref, cats, sal, postD, expD, desc] of demoJS.JB_DEMO_RAW as unknown as JobRow[]) {
      const data = { companyName: co, title, description: desc, workLocation: loc, region: loc.split(' ')[0], employmentType: emp, experience: exp, education: edu, requiredCerts: req, preferredCerts: pref, categories: cats, salary: sal, postedAt: day(base, postD), expiresAt: day(base, expD), isDemo: true };
      await prisma.jobPosting.upsert({ where: { provider_providerJobId: { provider: 'DEMO', providerJobId: id } }, create: { provider: 'DEMO', providerJobId: id, ...data }, update: data });
    }
    type ProgRow = [string, string, string, string, string, string | null, string[], string[], string, number, number, string, string];
    for (const [id, via, title, agency, region, sgg, stages, inds, type, s0, s1, elig, sum] of demoJS.SU_DEMO_PROGRAMS as unknown as ProgRow[]) {
      const data = { title, agency, region, sigungu: sgg, targetStages: stages, industries: inds, supportType: type, applyStart: day(base, s0), applyEnd: day(base, s1), eligibility: elig, summary: `${sum} · 데모 원천: ${via}`, isDemo: true };
      await prisma.startupProgram.upsert({ where: { provider_externalId: { provider: 'DEMO', externalId: id } }, create: { provider: 'DEMO', externalId: id, ...data }, update: data });
    }
  }

  // 포인트몰 예시 상품 (데모 lN 10종, 테스트 공급사 — 실제 사용 불가 쿠폰)
  if (plan.demoContent) {
    type P = { id: string; category: string; brand: string; name: string; price: number };
    for (const [i, p] of (demoJS.MALL_PRODUCTS as P[]).entries()) {
      await prisma.mallProduct.upsert({ where: { id: p.id }, create: { ...p, supplier: 'TEST', isDemo: true, sortOrder: i }, update: { category: p.category, brand: p.brand, name: p.name, price: p.price } });
    }
  }

  if (plan.devUsers) {
    const pw = await bcrypt.hash('PlitAdmin123!', 12);
    for (const [email, nickname, role, code] of [['admin@plit.local', '최고관리자', 'SUPER_ADMIN', 'ADMIN001'], ['operator@plit.local', '운영자', 'OPERATOR', 'OPER0001']] as const) {
      await prisma.user.upsert({ where: { email }, create: { email, nickname, role, passwordHash: pw, referralCode: code, emailVerified: true, isTest: true }, update: {} });
    }
  }
  console.log(`seed: certifications=${rows.length}, offerings=${await prisma.challengeOffering.count()}, jobs=${await prisma.jobPosting.count()}, programs=${await prisma.startupProgram.count()}, policy=${DEFAULT_POLICY_VERSION}`);
}

main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
