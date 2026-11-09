import { HttpStatus, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AppError, Forbidden, NotFound } from '../../common/errors';
import { PrismaService } from '../../common/prisma.service';
import { checkText } from '../../common/text-filter';
import { kstDate } from '../../common/time';
import { ModerationService } from './moderation.service';

export const CATEGORIES = ['질문', '응원', '학습 기록', '합격 후기'] as const;
export const POST_RULES = { titleMin: 2, titleMax: 60, bodyMin: 5, bodyMax: 2000, commentMax: 500, pageSize: 20 };
/** 스터디룸 글이 전체 커뮤니티에 공개된다는 고지 (데모 PB_NOTICE) — 문구 변경 시 버전 올림 → 재확인 필요 */
export const ROOM_POST_NOTICE = { version: '2026-10-v1', text: '이 게시글은 작성 즉시 플릿 전체 커뮤니티에도 공개됩니다. 채팅은 공유되지 않습니다.' };

const postSelect = { id: true, category: true, title: true, body: true, certId: true, origin: true, roomId: true, isPublic: true, likeCount: true, viewCount: true, commentCount: true, createdAt: true, authorId: true, author: { select: { nickname: true } } } satisfies Prisma.CommunityPostSelect;

@Injectable()
export class CommunityService {
  constructor(private readonly prisma: PrismaService, private readonly moderation: ModerationService) {}

  /** 제목·본문 길이 + 공통 텍스트 필터 */
  validatePost(title: string, body: string) {
    const t = title.trim(), b = body.trim();
    if (t.length < POST_RULES.titleMin || t.length > POST_RULES.titleMax) throw new AppError('TITLE_LENGTH', `제목은 ${POST_RULES.titleMin}~${POST_RULES.titleMax}자로 입력해주세요.`);
    if (b.length < POST_RULES.bodyMin || b.length > POST_RULES.bodyMax) throw new AppError('BODY_LENGTH', `내용은 ${POST_RULES.bodyMin}~${POST_RULES.bodyMax}자로 입력해주세요.`);
    const c = checkText(`${t}\n${b}`);
    if (!c.ok) throw new AppError(`TEXT_${c.code}`, c.message);
    return { title: t, body: b };
  }

  private async certNames(ids: (string | null)[]) {
    const list = [...new Set(ids.filter((x): x is string => !!x))];
    const rows = list.length ? await this.prisma.certification.findMany({ where: { id: { in: list } }, select: { id: true, name: true } }) : [];
    return new Map(rows.map((r) => [r.id, r.name]));
  }

  private shape(p: Prisma.CommunityPostGetPayload<{ select: typeof postSelect }>, names: Map<string, string>, viewerId?: string, liked = false) {
    const { author, authorId, ...rest } = p;
    return { ...rest, author: author.nickname, mine: viewerId === authorId, authorId, liked, certName: p.certId ? names.get(p.certId) ?? null : null };
  }

  /** 전체 커뮤니티 목록: 공개·정상 글만, 내가 신고한 글·차단한 사람 글 제외 */
  async list(viewerId: string | undefined, q: { category?: string; q?: string; certId?: string; roomId?: string; sort?: 'recent' | 'popular'; cursor?: string }) {
    const hidden = await this.moderation.hiddenFor(viewerId);
    const where: Prisma.CommunityPostWhereInput = { status: 'VISIBLE', ...(q.roomId ? { roomId: q.roomId } : { isPublic: true }) };
    if (q.category) where.category = q.category;
    if (q.certId) where.certId = q.certId;
    if (q.q) where.OR = [{ title: { contains: q.q, mode: 'insensitive' } }, { body: { contains: q.q, mode: 'insensitive' } }];
    if (hidden.targetIds.size || hidden.authorIds.size) where.AND = [{ id: { notIn: [...hidden.targetIds] } }, { authorId: { notIn: [...hidden.authorIds] } }];
    const rows = await this.prisma.communityPost.findMany({
      where, select: postSelect, take: POST_RULES.pageSize + 1,
      orderBy: q.sort === 'popular' ? [{ likeCount: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }] : [{ createdAt: 'desc' }, { id: 'desc' }],
      ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
    });
    const page = rows.slice(0, POST_RULES.pageSize);
    const likes = viewerId ? new Set((await this.prisma.postLike.findMany({ where: { userId: viewerId, postId: { in: page.map((p) => p.id) } } })).map((l) => l.postId)) : new Set<string>();
    const names = await this.certNames(page.map((p) => p.certId));
    return { items: page.map((p) => ({ ...this.shape(p, names, viewerId, likes.has(p.id)), body: p.body.slice(0, 140) })), nextCursor: rows.length > POST_RULES.pageSize ? page[page.length - 1].id : null };
  }

  /** 상세: 회원은 1인 1일 1회 조회수 반영. 비공개(스터디룸 전용) 글은 참여자만 */
  async detail(id: string, viewerId?: string, canSeeRoom?: (roomId: string) => Promise<boolean>) {
    const p = await this.prisma.communityPost.findUnique({ where: { id }, select: { ...postSelect, status: true } });
    if (!p || p.status !== 'VISIBLE') throw NotFound('게시글');
    if (!p.isPublic && (!viewerId || !p.roomId || !(await canSeeRoom?.(p.roomId)))) throw NotFound('게시글');
    if (viewerId) {
      const r = await this.prisma.postView.createMany({ data: [{ postId: id, userId: viewerId, day: kstDate() }], skipDuplicates: true });
      if (r.count) { await this.prisma.communityPost.update({ where: { id }, data: { viewCount: { increment: 1 } } }); p.viewCount += 1; }
    }
    const hidden = await this.moderation.hiddenFor(viewerId);
    const comments = await this.prisma.communityComment.findMany({ where: { postId: id, status: { not: 'HIDDEN' } }, orderBy: { createdAt: 'asc' }, include: { author: { select: { nickname: true } } } });
    const liked = viewerId ? !!(await this.prisma.postLike.findUnique({ where: { postId_userId: { postId: id, userId: viewerId } } })) : false;
    const names = await this.certNames([p.certId]);
    const { status: _s, ...post } = p;
    return {
      ...this.shape(post, names, viewerId, liked),
      comments: comments.filter((c) => !hidden.targetIds.has(c.id) && !hidden.authorIds.has(c.authorId)).map((c) => ({
        id: c.id, authorId: c.authorId, author: c.status === 'DELETED' ? '' : c.author.nickname, body: c.status === 'DELETED' ? '' : c.body,
        deleted: c.status === 'DELETED', mine: c.authorId === viewerId, createdAt: c.createdAt,
      })),
    };
  }

  async create(authorId: string, dto: { category: string; title: string; body: string; certId?: string }, room?: { roomId: string; certId: string; isPublic: boolean }) {
    if (!(CATEGORIES as readonly string[]).includes(dto.category)) throw new AppError('INVALID_CATEGORY', `카테고리는 ${CATEGORIES.join(', ')} 중 하나예요.`);
    const v = this.validatePost(dto.title, dto.body);
    const certId = room?.certId ?? dto.certId ?? null;
    if (certId && !room && !(await this.prisma.certification.findUnique({ where: { id: certId } }))) throw NotFound('자격증');
    const since = new Date(Date.now() - 60_000);
    if ((await this.prisma.communityPost.count({ where: { authorId, createdAt: { gte: since } } })) >= 3) throw new AppError('POST_RATE', '잠시 후 다시 작성해주세요. (1분에 3개)', HttpStatus.TOO_MANY_REQUESTS);
    const p = await this.prisma.communityPost.create({
      data: { authorId, category: dto.category, ...v, certId, origin: room ? 'STUDY_ROOM' : 'COMMUNITY', roomId: room?.roomId ?? null, isPublic: room ? room.isPublic : true },
    });
    return { id: p.id, isPublic: p.isPublic, origin: p.origin };
  }

  async remove(userId: string, id: string) {
    const p = await this.prisma.communityPost.findUnique({ where: { id } });
    if (!p || p.status === 'DELETED') throw NotFound('게시글');
    if (p.authorId !== userId) throw Forbidden('NOT_OWNER', '내가 쓴 글만 삭제할 수 있어요.');
    await this.prisma.communityPost.update({ where: { id }, data: { status: 'DELETED' } });
  }

  async comment(authorId: string, postId: string, raw: string, canSeeRoom?: (roomId: string) => Promise<boolean>) {
    const p = await this.prisma.communityPost.findUnique({ where: { id: postId } });
    if (!p || p.status !== 'VISIBLE') throw NotFound('게시글');
    if (!p.isPublic && (!p.roomId || !(await canSeeRoom?.(p.roomId)))) throw NotFound('게시글');
    const body = raw.trim();
    if (body.length > POST_RULES.commentMax) throw new AppError('COMMENT_LENGTH', `댓글은 ${POST_RULES.commentMax}자 이하로 입력해주세요.`);
    const c = checkText(body);
    if (!c.ok) throw new AppError(`TEXT_${c.code}`, c.message);
    const [row] = await this.prisma.$transaction([
      this.prisma.communityComment.create({ data: { postId, authorId, body } }),
      this.prisma.communityPost.update({ where: { id: postId }, data: { commentCount: { increment: 1 } } }),
    ]);
    return { id: row.id };
  }

  /** 댓글 삭제: 본문만 지우고 자리 유지 ("삭제된 댓글") — 데모 동일 */
  async removeComment(userId: string, id: string) {
    const c = await this.prisma.communityComment.findUnique({ where: { id } });
    if (!c || c.status === 'DELETED') throw NotFound('댓글');
    if (c.authorId !== userId) throw Forbidden('NOT_OWNER', '내가 쓴 댓글만 삭제할 수 있어요.');
    await this.prisma.$transaction([
      this.prisma.communityComment.update({ where: { id }, data: { status: 'DELETED', body: '' } }),
      this.prisma.communityPost.update({ where: { id: c.postId }, data: { commentCount: { decrement: 1 } } }),
    ]);
  }

  /** 좋아요 토글: 존재 여부를 기준으로 생성/삭제 + 카운트 (동시 요청에도 1인 1회) */
  async setLike(userId: string, postId: string, on: boolean) {
    const p = await this.prisma.communityPost.findUnique({ where: { id: postId } });
    if (!p || p.status !== 'VISIBLE') throw NotFound('게시글');
    return this.prisma.$transaction(async (tx) => {
      if (on) {
        const r = await tx.postLike.createMany({ data: [{ postId, userId }], skipDuplicates: true });
        if (r.count) await tx.communityPost.update({ where: { id: postId }, data: { likeCount: { increment: 1 } } });
      } else {
        const r = await tx.postLike.deleteMany({ where: { postId, userId } });
        if (r.count) await tx.communityPost.update({ where: { id: postId }, data: { likeCount: { decrement: 1 } } });
      }
      const after = await tx.communityPost.findUniqueOrThrow({ where: { id: postId }, select: { likeCount: true } });
      return { liked: on, likeCount: after.likeCount };
    });
  }
}
