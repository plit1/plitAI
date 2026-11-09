import { Injectable } from '@nestjs/common';
import { ReportStatus, ReportTarget } from '@prisma/client';
import { AppError, Conflict, NotFound } from '../../common/errors';
import { PrismaService } from '../../common/prisma.service';
import { AuditService } from '../admin/audit.service';

/** 신고·차단·운영 숨김 (커뮤니티 게시글/댓글, 스터디룸 채팅 공용) */
@Injectable()
export class ModerationService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  private async target(type: ReportTarget, id: string) {
    if (type === 'POST') { const p = await this.prisma.communityPost.findUnique({ where: { id } }); return p && { authorId: p.authorId, excerpt: p.title, roomId: p.roomId, status: p.status }; }
    if (type === 'COMMENT') { const c = await this.prisma.communityComment.findUnique({ where: { id }, include: { post: true } }); return c && { authorId: c.authorId, excerpt: c.body, roomId: c.post.roomId, status: c.status }; }
    const m = await this.prisma.chatMessage.findUnique({ where: { id } }); return m && { authorId: m.authorId, excerpt: m.body, roomId: m.roomId, status: m.status };
  }

  /** 신고: 본인 글 불가, 같은 대상 중복 불가. 신고자 화면에서는 즉시 가려짐 (hiddenFor) */
  async report(reporterId: string, type: ReportTarget, targetId: string, reason: string) {
    const t = await this.target(type, targetId);
    if (!t || t.status === 'DELETED') throw NotFound('신고 대상');
    if (t.authorId === reporterId) throw new AppError('SELF_REPORT', '내가 쓴 글은 신고할 수 없어요.');
    const dup = await this.prisma.contentReport.findUnique({ where: { reporterId_targetType_targetId: { reporterId, targetType: type, targetId } } });
    if (dup) throw Conflict('ALREADY_REPORTED', '이미 신고한 내용이에요.');
    await this.prisma.contentReport.create({ data: { reporterId, targetType: type, targetId, targetAuthorId: t.authorId, roomId: t.roomId, excerpt: t.excerpt.slice(0, 80), reason: reason.slice(0, 200) } });
    return { ok: true, message: '신고가 접수됐어요. 운영 검토 전까지 내 화면에서 가려져요.' };
  }

  /** 뷰어에게 숨겨야 할 대상 ID·작성자 (본인이 신고한 대상, 차단한 사람) */
  async hiddenFor(viewerId?: string) {
    if (!viewerId) return { targetIds: new Set<string>(), authorIds: new Set<string>() };
    const [reports, blocks] = await Promise.all([
      this.prisma.contentReport.findMany({ where: { reporterId: viewerId, status: 'PENDING' }, select: { targetId: true } }),
      this.prisma.userBlock.findMany({ where: { blockerId: viewerId }, select: { blockedId: true } }),
    ]);
    return { targetIds: new Set(reports.map((r) => r.targetId)), authorIds: new Set(blocks.map((b) => b.blockedId)) };
  }

  async block(blockerId: string, blockedId: string) {
    if (blockerId === blockedId) throw new AppError('SELF_BLOCK', '나를 차단할 수 없어요.');
    if (!(await this.prisma.user.findUnique({ where: { id: blockedId } }))) throw NotFound('회원');
    await this.prisma.userBlock.upsert({ where: { blockerId_blockedId: { blockerId, blockedId } }, create: { blockerId, blockedId }, update: {} });
  }
  async unblock(blockerId: string, blockedId: string) { await this.prisma.userBlock.deleteMany({ where: { blockerId, blockedId } }); }
  async blocks(blockerId: string) {
    const rows = await this.prisma.userBlock.findMany({ where: { blockerId }, orderBy: { createdAt: 'desc' } });
    const users = await this.prisma.user.findMany({ where: { id: { in: rows.map((r) => r.blockedId) } }, select: { id: true, nickname: true } });
    return rows.map((r) => ({ userId: r.blockedId, nickname: users.find((u) => u.id === r.blockedId)?.nickname ?? '', at: r.createdAt }));
  }

  queue(status: ReportStatus = 'PENDING') {
    return this.prisma.contentReport.findMany({ where: { status }, orderBy: { createdAt: 'asc' }, take: 200 });
  }

  /** 운영 처리: hide(대상 숨김) · restore(숨김 해제) · dismiss(문제 없음). 같은 대상의 모든 신고를 함께 처리 + 감사 로그 */
  async moderate(adminId: string, reportId: string, action: 'hide' | 'restore' | 'dismiss', ip?: string) {
    const r = await this.prisma.contentReport.findUnique({ where: { id: reportId } });
    if (!r) throw NotFound('신고');
    const status: ReportStatus = action === 'dismiss' ? 'DISMISSED' : action === 'hide' ? 'HIDDEN' : 'DISMISSED';
    const contentStatus = action === 'hide' ? 'HIDDEN' : 'VISIBLE';
    return this.prisma.$transaction(async (tx) => {
      if (action !== 'dismiss') {
        if (r.targetType === 'POST') await tx.communityPost.updateMany({ where: { id: r.targetId, status: { not: 'DELETED' } }, data: { status: contentStatus } });
        if (r.targetType === 'COMMENT') await tx.communityComment.updateMany({ where: { id: r.targetId, status: { not: 'DELETED' } }, data: { status: contentStatus } });
        if (r.targetType === 'CHAT') await tx.chatMessage.updateMany({ where: { id: r.targetId, status: { not: 'DELETED' } }, data: { status: contentStatus } });
      }
      const { count } = await tx.contentReport.updateMany({ where: { targetType: r.targetType, targetId: r.targetId, status: { in: action === 'restore' ? ['HIDDEN', 'PENDING'] : ['PENDING'] } }, data: { status, handledById: adminId, handledAt: new Date() } });
      await this.audit.log(tx, { actorId: adminId, action: `REPORT_${action.toUpperCase()}`, targetType: r.targetType, targetId: r.targetId, after: { reports: count, contentStatus: action === 'dismiss' ? 'unchanged' : contentStatus }, ip });
      return { targetType: r.targetType, targetId: r.targetId, reportsHandled: count, contentStatus: action === 'dismiss' ? null : contentStatus };
    });
  }
}
