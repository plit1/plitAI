import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient, UserRole } from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/bootstrap';
import { DEFAULT_POLICY, DEFAULT_POLICY_VERSION } from '../src/modules/policy/policy.defaults';

export const prisma = new PrismaClient();

export async function createApp(): Promise<INestApplication> {
  const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = configureApp(mod.createNestApplication({ logger: false }));
  await app.init();
  return app;
}

/** 테스트 DB 초기화 (plit_test 전용 — setup-env 에서 DB 이름 검사) */
export async function resetDb() {
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  await prisma.$executeRawUnsafe(`TRUNCATE ${tables.map((t) => `"${t.tablename}"`).join(', ')} CASCADE`);
  await prisma.policyVersion.create({ data: { id: DEFAULT_POLICY_VERSION, values: DEFAULT_POLICY as any, isCurrent: true } });
  await prisma.certification.create({
    data: { id: 'industrial-safety', name: '산업안전기사', field: 'biz', qualType: '국가기술', challengeType: 'exam', issuer: '한국산업인력공단', difficulty: 4, tagline: 't', passRule: 'p', subjects: ['산업안전관리론', '인간공학', '기계위험방지', '전기위험방지'] },
  });
  const day = (n: number) => new Date(Date.now() + n * 86400000);
  await prisma.challengeOffering.createMany({
    data: [
      { id: 'is-open', certId: 'industrial-safety', round: '2027년 1회차', recruitEnd: day(5), examDate: day(60), durationDays: 56 },
      { id: 'is-small', certId: 'industrial-safety', round: '정원 3명', recruitEnd: day(5), examDate: day(60), durationDays: 56, freeCap: 3, premiumCap: 1 },
      { id: 'is-closed', certId: 'industrial-safety', round: '마감', recruitEnd: day(-1), examDate: day(30), durationDays: 56, status: 'closed' },
    ],
  });
}

let seq = 0;
export async function signup(app: INestApplication, opts: { role?: UserRole; nickname?: string } = {}) {
  const email = `u${Date.now()}${seq++}@test.plit`;
  const res = await request(app.getHttpServer()).post('/api/v1/auth/signup')
    .send({ email, password: 'abcd1234', nickname: opts.nickname ?? `user${seq}`, consents: ['TERMS', 'PRIVACY', 'AGE_14'] }).expect(201);
  if (opts.role) await prisma.user.update({ where: { id: res.body.user.id }, data: { role: opts.role } });
  const cookie = res.headers['set-cookie'] as unknown as string[];
  return { id: res.body.user.id as string, email, token: res.body.accessToken as string, cookie, auth: { Authorization: `Bearer ${res.body.accessToken}` } };
}
