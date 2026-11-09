import { HttpStatus, Injectable } from '@nestjs/common';
import { Prisma, QuizItemStatus } from '@prisma/client';
import { AppError, Conflict, NotFound } from '../../common/errors';
import { PrismaService } from '../../common/prisma.service';
import { AuditService } from '../admin/audit.service';
import { EntitlementService } from '../challenges/entitlement.service';
import { StudyService } from '../study/study.service';
import { XpService } from '../gamification/xp.service';
import { grade, pickItems, Subject, TEST_SIZE, unanswered } from './quiz.grading';

export const CLEAR_MODE_DAYS = 7; // 데모 ht.clearModeDays
const MIN_ITEMS = 4;
const TEST_XP = 30; // 데모 GX_POLICY.pet.testXp
const SAMPLE_NOTICE = '공식 기출 문제가 아닌 예시 문항이에요.';

@Injectable()
export class QuizService {
  constructor(private readonly prisma: PrismaService, private readonly entitlements: EntitlementService, private readonly study: StudyService, private readonly audit: AuditService, private readonly xp: XpService) {}

  /** 응시 시작. 제출 전 응시가 있으면 그대로 반환 (새로 뽑아 정답 탐색하는 것 방지) */
  async start(userId: string, enrollmentId: string) {
    const { enrollment } = await this.entitlements.require(userId, enrollmentId, 'QUICK_TEST');
    const snap = await this.study.snapshot(enrollmentId);
    if (snap.daysLeft <= 0) throw new AppError('EXAM_FINISHED', '시험이 끝나 실력 점검을 할 수 없어요. 합격 인증을 진행해주세요.');
    const kind = snap.daysLeft <= CLEAR_MODE_DAYS ? 'FINAL' : 'QUICK';

    const open = await this.prisma.quizAttempt.findFirst({ where: { enrollmentId, submittedAt: null }, orderBy: { createdAt: 'desc' } });
    if (open) return this.view(open.id);

    const pool = await this.prisma.quizItem.findMany({ where: { certId: enrollment.certId, status: 'PUBLISHED' }, select: { id: true, subject: true } });
    if (pool.length < MIN_ITEMS) throw new AppError('NO_QUIZ_ITEMS', '이 자격증의 실력 점검 문항을 준비 중이에요.', HttpStatus.NOT_FOUND);
    const picked = pickItems(pool, snap.rec.subjects as unknown as Subject[], TEST_SIZE);
    const a = await this.prisma.quizAttempt.create({ data: { userId, enrollmentId, kind, itemIds: picked.map((p) => p.id), total: picked.length } });
    return this.view(a.id);
  }

  /** 응시 화면: 제출 전에는 정답·해설을 절대 포함하지 않는다 */
  async view(attemptId: string, userId?: string) {
    const a = await this.prisma.quizAttempt.findUnique({ where: { id: attemptId } });
    if (!a || (userId && a.userId !== userId)) throw NotFound('응시');
    const items = await this.prisma.quizItem.findMany({ where: { id: { in: a.itemIds } } });
    const byId = new Map(items.map((i) => [i.id, i]));
    const submitted = !!a.submittedAt;
    const answers = (a.answers ?? {}) as Record<string, number>;
    return {
      id: a.id, kind: a.kind, title: a.kind === 'FINAL' ? 'FINAL CLEAR TEST' : 'QUICK TEST', total: a.total, submittedAt: a.submittedAt,
      notice: items.some((i) => i.isSample) ? SAMPLE_NOTICE : null,
      items: a.itemIds.map((id, n) => {
        const i = byId.get(id)!;
        return { no: n + 1, id, subject: i.subject, prompt: i.prompt, options: i.options, ...(submitted ? { answer: i.answer, chosen: answers[id] ?? null, correct: answers[id] === i.answer, explanation: i.explanation } : {}) };
      }),
      result: submitted ? a.result : null,
    };
  }

  /** 제출·채점 (1회). 학습기록 정확도·예상점수·과목 갱신 + XP + 지표 전후 */
  async submit(userId: string, attemptId: string, answers: Record<string, number>) {
    const a = await this.prisma.quizAttempt.findUnique({ where: { id: attemptId } });
    if (!a || a.userId !== userId) throw NotFound('응시');
    if (a.submittedAt) throw Conflict('ALREADY_SUBMITTED', '이미 제출한 시험이에요.');
    await this.entitlements.require(userId, a.enrollmentId, 'QUICK_TEST');
    const missing = unanswered(a.itemIds, answers);
    if (missing.length) throw new AppError('UNANSWERED', `${missing.join(', ')}번 문항에 답해주세요.`, HttpStatus.BAD_REQUEST, { missing });
    const items = await this.prisma.quizItem.findMany({ where: { id: { in: a.itemIds } }, select: { id: true, subject: true, answer: true, options: true } });
    for (const i of items) if (!Number.isInteger(answers[i.id]) || answers[i.id] < 0 || answers[i.id] >= i.options.length) throw new AppError('INVALID_ANSWER', '보기 번호를 확인해주세요.');
    const clean = Object.fromEntries(a.itemIds.map((id) => [id, answers[id]]));

    const before = await this.study.snapshot(a.enrollmentId);
    const g = grade(items, clean, before.rec.subjects as unknown as Subject[]);
    const indexBefore = this.study.indexFor(before).value;
    const indexAfter = this.study.indexFor(before, g.accuracy).value;
    const result = { ...g, indexBefore, indexAfter };

    await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.quizAttempt.updateMany({
        where: { id: a.id, submittedAt: null },
        data: { submittedAt: new Date(), answers: clean, correct: g.correct, accuracy: g.accuracy, expectedScore: g.expectedScore, result: result as unknown as Prisma.InputJsonValue },
      });
      if (count === 0) throw Conflict('ALREADY_SUBMITTED', '이미 제출한 시험이에요.');
      const missions = (before.rec.missions as { title: string; done: boolean }[]).map((m) => (/QUICK TEST/.test(m.title) ? { ...m, done: true } : m));
      await tx.studyRecord.update({ where: { id: before.rec.id }, data: { accuracy: g.accuracy, expectedScore: g.expectedScore, subjects: g.subjects as unknown as Prisma.InputJsonValue, missions: missions as unknown as Prisma.InputJsonValue } });
      await this.xp.award(tx, userId, [{ eventKey: `test:${a.id}`, sourceType: 'test', sourceId: a.id, deltaXp: TEST_XP }]);
    });
    return this.view(a.id, userId);
  }

  history(userId: string, enrollmentId: string) {
    return this.prisma.quizAttempt.findMany({ where: { userId, enrollmentId, submittedAt: { not: null } }, orderBy: { submittedAt: 'desc' }, select: { id: true, kind: true, accuracy: true, expectedScore: true, correct: true, total: true, submittedAt: true } });
  }

  // ── 관리자 문항 관리 ──
  adminList(certId?: string, status?: QuizItemStatus) {
    return this.prisma.quizItem.findMany({ where: { ...(certId ? { certId } : {}), ...(status ? { status } : {}) }, orderBy: [{ certId: 'asc' }, { subject: 'asc' }, { createdAt: 'asc' }], take: 500 });
  }

  private validate(i: { certId: string; subject: string; options: string[]; answer: number; source: string; status?: QuizItemStatus }, subjects: string[]) {
    if (!subjects.includes(i.subject)) throw new AppError('INVALID_SUBJECT', `과목은 ${subjects.join(', ')} 중 하나여야 해요.`);
    if (i.options.length < 2 || i.options.length > 5 || i.options.some((o) => !o.trim())) throw new AppError('INVALID_OPTIONS', '보기는 2~5개, 빈 값 없이 입력해주세요.');
    if (!Number.isInteger(i.answer) || i.answer < 0 || i.answer >= i.options.length) throw new AppError('INVALID_ANSWER', '정답 번호가 보기 범위를 벗어났어요.');
    if (i.status === 'PUBLISHED' && !i.source.trim()) throw new AppError('SOURCE_REQUIRED', '출처를 확인한 문항만 공개할 수 있어요.');
  }

  async adminCreate(adminId: string, dto: { certId: string; subject: string; prompt: string; options: string[]; answer: number; explanation?: string; source: string; status?: QuizItemStatus }, ip?: string) {
    const cert = await this.prisma.certification.findUnique({ where: { id: dto.certId } });
    if (!cert) throw NotFound('자격증');
    this.validate(dto, cert.subjects);
    return this.prisma.$transaction(async (tx) => {
      const item = await tx.quizItem.create({ data: { ...dto, status: dto.status ?? 'DRAFT' } });
      await this.audit.log(tx, { actorId: adminId, action: 'QUIZ_ITEM_CREATE', targetType: 'QuizItem', targetId: item.id, after: { certId: item.certId, status: item.status }, ip });
      return item;
    });
  }

  async adminUpdate(adminId: string, id: string, patch: Partial<{ subject: string; prompt: string; options: string[]; answer: number; explanation: string; source: string; status: QuizItemStatus }>, ip?: string) {
    const before = await this.prisma.quizItem.findUnique({ where: { id } });
    if (!before) throw NotFound('문항');
    const cert = await this.prisma.certification.findUniqueOrThrow({ where: { id: before.certId } });
    const defined = Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined)) as typeof patch;
    const next = { ...before, ...defined };
    this.validate(next, cert.subjects);
    return this.prisma.$transaction(async (tx) => {
      const item = await tx.quizItem.update({ where: { id }, data: defined });
      await this.audit.log(tx, { actorId: adminId, action: 'QUIZ_ITEM_UPDATE', targetType: 'QuizItem', targetId: id, before: { status: before.status, answer: before.answer }, after: { status: item.status, answer: item.answer }, ip });
      return item;
    });
  }
}
