import { Body, Controller, Delete, Get, HttpCode, Patch, Post, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { ConsentType } from '@prisma/client';
import { IsBoolean, IsEnum, IsOptional, IsString, Length } from 'class-validator';
import type { Response } from 'express';
import { AuthUser, CurrentUser } from '../../common/auth.decorators';
import { AppError, NotFound } from '../../common/errors';
import { PrismaService } from '../../common/prisma.service';
import { CONSENT_VERSION, REQUIRED_CONSENTS } from '../auth/auth.service';
import { REFRESH_COOKIE } from '../auth/auth.controller';
import { TokenService } from '../auth/token.service';

class UpdateMeDto { @ApiPropertyOptional() @IsOptional() @IsString() @Length(2, 12) nickname?: string; }
class ConsentDto { @ApiProperty({ enum: ConsentType }) @IsEnum(ConsentType) type: ConsentType; @ApiProperty() @IsBoolean() agreed: boolean; }
class WithdrawDto { @ApiProperty({ description: '"탈퇴합니다" 입력' }) @IsString() confirm: string; }

@ApiTags('me')
@ApiBearerAuth()
@Controller('me')
export class UsersController {
  constructor(private readonly prisma: PrismaService, private readonly tokens: TokenService) {}

  @Get()
  async me(@CurrentUser() u: AuthUser) {
    const user = await this.prisma.user.findUnique({
      where: { id: u.id },
      select: { id: true, email: true, nickname: true, role: true, referralCode: true, createdAt: true, identities: { select: { provider: true } }, pointAccount: { select: { balance: true } } },
    });
    if (!user) throw NotFound('회원');
    const [enrollments, activePasses] = await Promise.all([
      this.prisma.enrollment.count({ where: { userId: u.id, status: 'ACTIVE' } }),
      this.prisma.boosterPass.count({ where: { userId: u.id, status: 'ACTIVE', expiresAt: { gt: new Date() } } }),
    ]);
    const { pointAccount, identities, ...rest } = user;
    return { ...rest, providers: identities.map((i) => i.provider), points: pointAccount?.balance ?? 0, activeEnrollments: enrollments, activePasses };
  }

  @Patch()
  async update(@CurrentUser() u: AuthUser, @Body() dto: UpdateMeDto) {
    return this.prisma.user.update({ where: { id: u.id }, data: { nickname: dto.nickname?.trim() }, select: { id: true, nickname: true } });
  }

  /** 현재 동의 상태 (유형별 최신 이력) */
  @Get('consents')
  async consents(@CurrentUser() u: AuthUser) {
    const rows = await this.prisma.userConsent.findMany({ where: { userId: u.id }, orderBy: { createdAt: 'desc' } });
    const latest = new Map<ConsentType, (typeof rows)[number]>();
    for (const r of rows) if (!latest.has(r.type)) latest.set(r.type, r);
    return [...latest.values()].map((r) => ({ type: r.type, agreed: r.agreed, version: r.version, at: r.createdAt }));
  }

  @Post('consents')
  async setConsent(@CurrentUser() u: AuthUser, @Body() dto: ConsentDto) {
    if (REQUIRED_CONSENTS.includes(dto.type) && !dto.agreed) throw new AppError('REQUIRED_CONSENT', '필수 동의는 철회할 수 없어요. 철회를 원하시면 회원 탈퇴를 이용해주세요.');
    await this.prisma.userConsent.create({ data: { userId: u.id, type: dto.type, agreed: dto.agreed, version: CONSENT_VERSION } });
    return { ok: true };
  }

  /** 최근 활동 (참여·학습·포인트) */
  @Get('activity')
  async activity(@CurrentUser() u: AuthUser) {
    const [enrollments, sessions, points] = await Promise.all([
      this.prisma.enrollment.findMany({ where: { userId: u.id }, orderBy: { joinedAt: 'desc' }, take: 10, select: { id: true, offeringId: true, certId: true, plan: true, status: true, joinedAt: true } }),
      this.prisma.studySession.findMany({ where: { userId: u.id, status: 'COMPLETED' }, orderBy: { endedAt: 'desc' }, take: 10, select: { id: true, enrollmentId: true, minutes: true, endedAt: true } }),
      this.prisma.pointLedgerEntry.findMany({ where: { userId: u.id }, orderBy: { createdAt: 'desc' }, take: 10, select: { id: true, type: true, amount: true, reason: true, createdAt: true } }),
    ]);
    return { enrollments, sessions, points };
  }

  /**
   * 회원 탈퇴: 개인정보 익명화 + 세션 폐기.
   * 결제·포인트 원장은 전자상거래법(5년) 등 법정 보존 대상이라 삭제하지 않고 userId 로만 연결 유지.
   */
  @Delete()
  @HttpCode(204)
  async withdraw(@CurrentUser() u: AuthUser, @Body() dto: WithdrawDto, @Res({ passthrough: true }) res: Response) {
    if (dto.confirm !== '탈퇴합니다') throw new AppError('CONFIRM_REQUIRED', '"탈퇴합니다"를 정확히 입력해주세요.');
    await this.prisma.$transaction([
      this.prisma.authIdentity.deleteMany({ where: { userId: u.id } }),
      this.prisma.favoriteCertification.deleteMany({ where: { userId: u.id } }),
      this.prisma.user.update({ where: { id: u.id }, data: { status: 'WITHDRAWN', email: null, passwordHash: null, nickname: '탈퇴회원', mfaSecret: null, withdrawnAt: new Date() } }),
    ]);
    await this.tokens.revokeAll(u.id);
    res.clearCookie(REFRESH_COOKIE, { path: '/api/v1/auth' });
  }
}
