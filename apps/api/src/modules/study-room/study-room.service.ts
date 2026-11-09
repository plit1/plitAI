import { HttpStatus, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { AppError, Forbidden, NotFound } from '../../common/errors';
import { PrismaService } from '../../common/prisma.service';
import { AuditService } from '../admin/audit.service';
import { CommunityService, ROOM_POST_NOTICE } from '../community/community.service';
import { ModerationService } from '../community/moderation.service';
import { ChatGuard } from './chat-guard';

export const READONLY_DAYS = 7; // 데모 RC_READONLY_DAYS
export const HOLD_DAYS = 90; // 데모 EX_HOLD_DAYS: 신고·분쟁 채팅 보존 (관리자 전용)
export type RoomState = 'ACTIVE' | 'READ_ONLY' | 'ARCHIVED';
const DAY = 86400000;

export function roomState(closeAt: Date | null | undefined, now = Date.now()): RoomState {
  if (!closeAt) return 'ACTIVE';
  const c = closeAt.getTime();
  return now < c ? 'ACTIVE' : now < c + READONLY_DAYS * DAY ? 'READ_ONLY' : 'ARCHIVED';
}

@Injectable()
export class StudyRoomService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('StudyRoom');
  readonly guard = new ChatGuard();
  private timer?: NodeJS.Timeout;
  /** 게이트웨이가 등록: 서버에서 생긴 메시지를 방에 방송 */
  broadcaster?: (roomId: string, event: string, payload: unknown) => void;

  constructor(private readonly prisma: PrismaService, private readonly community: CommunityService, private readonly moderation: ModerationService, private readonly audit: AuditService) {}

  onModuleInit() {
    if (process.env.NODE_ENV === 'test') return;
    this.timer = setInterval(() => this.purgeDue().catch((e) => this.logger.error(e)), 10 * 60_000); // 10분마다 보관 대상 정리
  }
  onModuleDestroy() { if (this.timer) clearInterval(this.timer); }

  private async room(roomId: string) {
    const offering = await this.prisma.challengeOffering.findUnique({ where: { id: roomId }, include: { cert: { select: { id: true, name: true } } } });
    if (!offering) throw NotFound('스터디룸');
    const room = await this.prisma.studyRoom.upsert({ where: { id: roomId }, create: { id: roomId }, update: {} });
    return { offering, room, state: roomState(room.closeAt) };
  }

  /** 읽기 권한: 해당 회차 참여자(취소 제외) 또는 운영자 */
  async access(userId: string, role: UserRole, roomId: string) {
    const r = await this.room(roomId);
    const enrolled = await this.prisma.enrollment.findFirst({ where: { userId, offeringId: roomId, status: { not: 'CANCELLED' } } });
    if (!enrolled && role === 'USER') throw Forbidden('NOT_PARTICIPANT', '이 회차 챌린지 참여자만 들어올 수 있어요.');
    return { ...r, participant: !!enrolled };
  }

  async summary(userId: string, role: UserRole, roomId: string) {
    const r = await this.access(userId, role, roomId);
    const [participants, ack] = await Promise.all([
      this.prisma.enrollment.count({ where: { offeringId: roomId, status: { not: 'CANCELLED' } } }),
      this.prisma.noticeAck.findUnique({ where: { userId_version: { userId, version: ROOM_POST_NOTICE.version } } }),
    ]);
    return {
      roomId, certName: r.offering.cert.name, round: r.offering.round, state: r.state, closeAt: r.room.closeAt,
      readOnlyUntil: r.room.closeAt ? new Date(r.room.closeAt.getTime() + READONLY_DAYS * DAY) : null,
      participants, canWrite: r.participant && r.state === 'ACTIVE', autoShare: r.room.autoShare,
      notice: { ...ROOM_POST_NOTICE, acknowledged: !!ack },
    };
  }

  private writable(r: Awaited<ReturnType<StudyRoomService['access']>>) {
    if (r.state !== 'ACTIVE') throw new AppError('ROOM_CLOSED', r.state === 'READ_ONLY' ? '스터디룸이 종료돼 읽기 전용이에요. 새 채팅·글을 쓸 수 없어요.' : '보관 처리된 스터디룸이에요.', HttpStatus.FORBIDDEN);
    if (!r.participant) throw Forbidden('NOT_PARTICIPANT', '이 회차 챌린지 참여자만 작성할 수 있어요.');
  }

  private view(m: { id: string; roomId: string; authorId: string; kind: string; body: string; createdAt: Date; author: { nickname: string } }) {
    return { id: m.id, roomId: m.roomId, authorId: m.authorId, author: m.author.nickname, kind: m.kind, body: m.body, createdAt: m.createdAt };
  }

  /** 채팅 전송: 권한·상태 → 속도·필터 가드 → 저장 → 방송 */
  async send(userId: string, role: UserRole, roomId: string, body: string) {
    const r = await this.access(userId, role, roomId);
    this.writable(r);
    const g = this.guard.check(userId, roomId, body);
    if (!g.ok) throw new AppError(g.code === 'RATE' || g.code === 'BURST' || g.code === 'COOLDOWN' ? g.code : `TEXT_${g.code}`, g.message, g.code === 'RATE' || g.code === 'BURST' || g.code === 'COOLDOWN' ? HttpStatus.TOO_MANY_REQUESTS : HttpStatus.BAD_REQUEST);
    const m = await this.prisma.chatMessage.create({ data: { roomId, authorId: userId, body: g.text }, include: { author: { select: { nickname: true } } } });
    const v = this.view(m);
    this.broadcaster?.(roomId, 'message', v);
    return v;
  }

  /** 채팅 기록 (최신순 페이지, 화면에는 오래된 순으로) — 숨김·삭제, 내가 신고·차단한 대상 제외 */
  async history(userId: string, role: UserRole, roomId: string, before?: string, take = 40) {
    await this.access(userId, role, roomId);
    const hidden = await this.moderation.hiddenFor(userId);
    const cursor = before ? await this.prisma.chatMessage.findUnique({ where: { id: before } }) : null;
    const rows = await this.prisma.chatMessage.findMany({
      where: { roomId, status: 'VISIBLE', ...(cursor ? { createdAt: { lt: cursor.createdAt } } : {}), id: { notIn: [...hidden.targetIds] }, authorId: { notIn: [...hidden.authorIds] } },
      orderBy: { createdAt: 'desc' }, take: Math.min(100, take), include: { author: { select: { nickname: true } } },
    });
    return rows.reverse().map((m) => this.view(m));
  }

  /** 스터디룸 게시글: 자동 공개가 켜져 있으면 전체 커뮤니티에도 노출 → 공개 고지 확인 필요 (데모 pb 규칙) */
  async createPost(userId: string, role: UserRole, roomId: string, dto: { category: string; title: string; body: string; ack?: boolean }) {
    const r = await this.access(userId, role, roomId);
    this.writable(r);
    if (r.room.autoShare) {
      const acked = await this.prisma.noticeAck.findUnique({ where: { userId_version: { userId, version: ROOM_POST_NOTICE.version } } });
      if (!acked && !dto.ack) throw new AppError('NOTICE_REQUIRED', '전체 커뮤니티 공개 안내를 확인해 주세요.', HttpStatus.PRECONDITION_REQUIRED, ROOM_POST_NOTICE);
      if (!acked) await this.prisma.noticeAck.create({ data: { userId, version: ROOM_POST_NOTICE.version } });
    }
    return this.community.create(userId, dto, { roomId, certId: r.offering.certId, isPublic: r.room.autoShare });
  }

  async posts(userId: string, role: UserRole, roomId: string, cursor?: string) {
    await this.access(userId, role, roomId);
    return this.community.list(userId, { roomId, cursor });
  }

  // ── 관리자 ──
  async adminSet(adminId: string, roomId: string, patch: { closeAt?: string | null; autoShare?: boolean }, ip?: string) {
    const { room } = await this.room(roomId);
    if (patch.closeAt && Number.isNaN(Date.parse(patch.closeAt))) throw new AppError('INVALID_DATE', '종료 일시를 확인해주세요.');
    if (room.purgedAt && patch.closeAt === null) throw new AppError('ALREADY_PURGED', '이미 채팅이 삭제된 스터디룸은 다시 열 수 없어요.');
    return this.prisma.$transaction(async (tx) => {
      const after = await tx.studyRoom.update({ where: { id: roomId }, data: { ...(patch.closeAt !== undefined ? { closeAt: patch.closeAt ? new Date(patch.closeAt) : null } : {}), ...(patch.autoShare !== undefined ? { autoShare: patch.autoShare } : {}) } });
      await this.audit.log(tx, { actorId: adminId, action: 'STUDY_ROOM_UPDATE', targetType: 'StudyRoom', targetId: roomId, before: { closeAt: room.closeAt, autoShare: room.autoShare }, after: { closeAt: after.closeAt, autoShare: after.autoShare }, ip });
      return { ...after, state: roomState(after.closeAt) };
    });
  }

  /**
   * 보관 처리: 읽기 전용 기간이 끝난 방의 채팅을 삭제. 신고(대기·숨김)된 메시지는 관리자 전용 보존본(90일)으로 옮긴 뒤 삭제.
   * 게시글은 보존. 같은 방은 한 번만 처리(purgedAt). 재실행 안전.
   */
  async purgeDue(now = new Date()) {
    const due = await this.prisma.studyRoom.findMany({ where: { purgedAt: null, closeAt: { lte: new Date(now.getTime() - READONLY_DAYS * DAY) } } });
    const results = [];
    for (const room of due) {
      const r = await this.prisma.$transaction(async (tx) => {
        const flagged = await tx.contentReport.findMany({ where: { roomId: room.id, targetType: 'CHAT', status: { in: ['PENDING', 'HIDDEN'] } }, select: { targetId: true } });
        const msgs = await tx.chatMessage.findMany({ where: { roomId: room.id, id: { in: flagged.map((f) => f.targetId) } } });
        if (msgs.length) await tx.chatHold.createMany({ data: msgs.map((m) => ({ roomId: room.id, messageId: m.id, authorId: m.authorId, body: m.body, reason: '신고·분쟁 검토 보존', holdUntil: new Date(now.getTime() + HOLD_DAYS * DAY) })), skipDuplicates: true });
        const { count } = await tx.chatMessage.deleteMany({ where: { roomId: room.id } });
        await tx.studyRoom.update({ where: { id: room.id }, data: { purgedAt: now } });
        return { roomId: room.id, deleted: count, held: msgs.length };
      });
      this.logger.log(`purged ${r.roomId}: deleted=${r.deleted} held=${r.held}`);
      results.push(r);
    }
    const expired = await this.prisma.chatHold.deleteMany({ where: { holdUntil: { lte: now } } });
    return { rooms: results, expiredHolds: expired.count };
  }
}
