import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConnectedSocket, MessageBody, OnGatewayInit, SubscribeMessage, WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import type { Namespace, Socket } from 'socket.io';
import { AppError } from '../../common/errors';
import { PrismaService } from '../../common/prisma.service';
import { StudyRoomService } from './study-room.service';

type Ack = { ok: true; data?: unknown } | { ok: false; code: string; message: string };
const toAck = (e: unknown): Ack => (e instanceof AppError ? { ok: false, code: e.code, message: (e.getResponse() as { message: string }).message } : { ok: false, code: 'INTERNAL', message: '일시적인 오류가 발생했어요.' });

/**
 * 스터디룸 실시간 채팅 (socket.io, 네임스페이스 /study-room)
 *  - 연결 전 미들웨어에서 handshake.auth.token 의 access JWT 확인 (typ=access, 정상 회원)
 *    → 인증이 끝나기 전에 이벤트가 처리되는 경합이 없음. 실패 시 클라이언트는 connect_error 수신
 *  - join: 참여자만 방 입장 / send: 서비스 가드 통과 후 저장 → 방 전체 방송
 *  - 권한 판단은 모두 StudyRoomService (REST 와 동일 규칙)
 */
@WebSocketGateway({ namespace: '/study-room', cors: { origin: (process.env.APP_ORIGIN || 'http://localhost:3000').split(','), credentials: true } })
export class StudyRoomGateway implements OnGatewayInit {
  private readonly logger = new Logger('StudyRoomGateway');
  @WebSocketServer() server: Namespace;
  constructor(private readonly rooms: StudyRoomService, private readonly jwt: JwtService, private readonly prisma: PrismaService) {}

  afterInit(ns: Namespace) {
    this.rooms.broadcaster = (roomId, event, payload) => this.server.to(roomId).emit(event, payload);
    ns.use(async (client, next) => {
      try {
        const token = client.handshake.auth?.token as string | undefined;
        const p = token ? await this.jwt.verifyAsync<{ sub?: string; typ?: string }>(token).catch(() => null) : null;
        const user = p?.typ === 'access' && typeof p.sub === 'string' ? await this.prisma.user.findUnique({ where: { id: p.sub }, select: { id: true, role: true, status: true } }) : null;
        if (!user || user.status !== 'ACTIVE') return next(new Error('UNAUTHORIZED'));
        client.data.user = { id: user.id, role: user.role };
        next();
      } catch (e) {
        this.logger.error(e);
        next(new Error('UNAUTHORIZED'));
      }
    });
  }

  @SubscribeMessage('join')
  async join(@ConnectedSocket() c: Socket, @MessageBody() body: { roomId?: string }): Promise<Ack> {
    try {
      const u = c.data.user; const roomId = String(body?.roomId ?? '');
      const summary = await this.rooms.summary(u.id, u.role, roomId);
      await c.join(roomId);
      return { ok: true, data: { summary, messages: await this.rooms.history(u.id, u.role, roomId) } };
    } catch (e) { return toAck(e); }
  }

  @SubscribeMessage('send')
  async send(@ConnectedSocket() c: Socket, @MessageBody() body: { roomId?: string; body?: string }): Promise<Ack> {
    try {
      const u = c.data.user; const roomId = String(body?.roomId ?? '');
      if (!c.rooms.has(roomId)) return { ok: false, code: 'NOT_JOINED', message: '먼저 스터디룸에 입장해주세요.' };
      return { ok: true, data: await this.rooms.send(u.id, u.role, roomId, String(body?.body ?? '')) };
    } catch (e) { return toAck(e); }
  }
}
