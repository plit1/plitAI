/**
 * 개발/스테이징 시드. 데모 v2.9 의 자격증 50종(X5)과 회차 생성 규칙(Ys)을 그대로 재현한다.
 * 운영 DB 에서는 자격증·정책만 넣고 테스트 계정은 만들지 않는다 (SEED_DEV_USERS=false).
 */
import { ChallengeType, Prisma, PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import raw from './seed-data/certifications.raw.json';
import { DEFAULT_POLICY, DEFAULT_POLICY_VERSION } from '../src/modules/policy/policy.defaults';

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

  if (process.env.SEED_DEV_USERS !== 'false' && process.env.NODE_ENV !== 'production') {
    const pw = await bcrypt.hash('PlitAdmin123!', 12);
    for (const [email, nickname, role, code] of [['admin@plit.local', '최고관리자', 'SUPER_ADMIN', 'ADMIN001'], ['operator@plit.local', '운영자', 'OPERATOR', 'OPER0001']] as const) {
      await prisma.user.upsert({ where: { email }, create: { email, nickname, role, passwordHash: pw, referralCode: code, emailVerified: true, isTest: true }, update: {} });
    }
  }
  console.log(`seed: certifications=${rows.length}, offerings=${await prisma.challengeOffering.count()}, policy=${DEFAULT_POLICY_VERSION}`);
}

main().finally(() => prisma.$disconnect());
