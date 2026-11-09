import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { UserRole } from '@prisma/client';
import { randomUUID } from 'crypto';
import { randomToken, sha256 } from '../../common/crypto';
import { AppError } from '../../common/errors';
import { PrismaService } from '../../common/prisma.service';
import { HttpStatus } from '@nestjs/common';

export interface IssuedTokens { accessToken: string; refreshToken: string; refreshExpiresAt: Date; }

@Injectable()
export class TokenService {
  constructor(private readonly jwt: JwtService, private readonly prisma: PrismaService, private readonly config: ConfigService) {}

  private refreshTtlMs() { return Number(this.config.get('REFRESH_TTL_DAYS') ?? 30) * 86400000; }

  async issue(user: { id: string; role: UserRole }, meta: { ua?: string; ip?: string }, familyId: string = randomUUID()): Promise<IssuedTokens> {
    const accessToken = await this.jwt.signAsync({ sub: user.id, role: user.role });
    const refreshToken = randomToken(48);
    const refreshExpiresAt = new Date(Date.now() + this.refreshTtlMs());
    await this.prisma.refreshToken.create({ data: { userId: user.id, tokenHash: sha256(refreshToken), familyId, expiresAt: refreshExpiresAt, userAgent: meta.ua?.slice(0, 255), ip: meta.ip } });
    return { accessToken, refreshToken, refreshExpiresAt };
  }

  /** 회전: 사용된 토큰은 폐기하고 새 토큰 발급. 이미 폐기된 토큰이 다시 오면 탈취로 보고 family 전체 폐기. */
  async rotate(raw: string, meta: { ua?: string; ip?: string }): Promise<IssuedTokens> {
    const row = await this.prisma.refreshToken.findUnique({ where: { tokenHash: sha256(raw) }, include: { user: true } });
    const invalid = new AppError('INVALID_REFRESH', '다시 로그인해주세요.', HttpStatus.UNAUTHORIZED);
    if (!row) throw invalid;
    if (row.revokedAt) {
      await this.prisma.refreshToken.updateMany({ where: { familyId: row.familyId, revokedAt: null }, data: { revokedAt: new Date() } });
      throw invalid;
    }
    if (row.expiresAt < new Date() || row.user.status !== 'ACTIVE') throw invalid;
    // 조건부 업데이트로 동시 회전 경합 방지
    const { count } = await this.prisma.refreshToken.updateMany({ where: { id: row.id, revokedAt: null }, data: { revokedAt: new Date() } });
    if (count === 0) throw invalid;
    const next = await this.issue(row.user, meta, row.familyId);
    await this.prisma.refreshToken.update({ where: { id: row.id }, data: { replacedBy: sha256(next.refreshToken) } });
    return next;
  }

  async revoke(raw: string) {
    await this.prisma.refreshToken.updateMany({ where: { tokenHash: sha256(raw), revokedAt: null }, data: { revokedAt: new Date() } });
  }

  async revokeAll(userId: string) {
    await this.prisma.refreshToken.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
  }
}
