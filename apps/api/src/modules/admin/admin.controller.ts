import { Body, Controller, Get, Param, Patch, Post, Query, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { OfferingStatus, OrderStatus, Prisma, UserRole, UserStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsBoolean, IsDateString, IsEnum, IsInt, IsNotEmpty, IsObject, IsOptional, IsString, Length, Matches, Max, Min } from 'class-validator';
import type { Request } from 'express';
import { AuthUser, CurrentUser, Roles } from '../../common/auth.decorators';
import { AppError, NotFound } from '../../common/errors';
import { PrismaService } from '../../common/prisma.service';
import { PaymentsService } from '../payments/payments.service';
import { PointsService } from '../points/points.service';
import { FEATURES, PolicyValues } from '../policy/policy.defaults';
import { PolicyService } from '../policy/policy.service';
import { AuditService } from './audit.service';

class UserQuery { @ApiPropertyOptional() @IsOptional() @IsString() q?: string; }
class RoleDto { @ApiProperty({ enum: UserRole }) @IsEnum(UserRole) role: UserRole; }
class StatusDto { @ApiProperty({ enum: [UserStatus.ACTIVE, UserStatus.SUSPENDED] }) @IsEnum(UserStatus) status: UserStatus; @ApiProperty() @IsString() @Length(2, 200) reason: string; }
class RefundDto { @ApiProperty() @IsString() @Length(2, 200) reason: string; }
class AdjustDto {
  @ApiProperty() @IsInt() @Min(-1_000_000) @Max(1_000_000) amount: number;
  @ApiProperty() @IsString() @Length(2, 200) reason: string;
  @ApiProperty({ description: '중복 지급 방지 키 (같은 키는 1회만 반영)' }) @IsString() @Length(4, 100) idempotencyKey: string;
}
class PolicyDto {
  @ApiProperty({ example: '2026-11-v2.3' }) @IsString() @Matches(/^[0-9]{4}-[0-9]{2}-v[0-9.]+$/) version: string;
  @ApiProperty() @IsObject() values: Partial<PolicyValues>;
}
class OrderQuery { @ApiPropertyOptional({ enum: OrderStatus }) @IsOptional() @IsEnum(OrderStatus) status?: OrderStatus; }
class OfferingDto {
  @ApiProperty() @IsString() @Matches(/^[a-z0-9-]{3,80}$/) id: string;
  @ApiProperty() @IsString() @IsNotEmpty() certId: string;
  @ApiProperty() @IsString() @Length(2, 50) round: string;
  @ApiProperty() @IsDateString() recruitEnd: string;
  @ApiProperty() @IsDateString() examDate: string;
  @ApiProperty() @Type(() => Number) @IsInt() @Min(1) @Max(365) durationDays: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) freeCap?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) premiumCap?: number;
}
class OfferingPatchDto {
  @ApiPropertyOptional({ enum: OfferingStatus }) @IsOptional() @IsEnum(OfferingStatus) status?: OfferingStatus;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) freeCap?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) premiumCap?: number;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() hidden?: boolean;
}

@ApiTags('admin')
@ApiBearerAuth()
@Roles('OPERATOR')
@Controller('admin')
export class AdminController {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService, private readonly points: PointsService, private readonly payments: PaymentsService, private readonly policy: PolicyService) {}

  @Get('stats')
  async stats() {
    const [users, enrollments, paid, refunded, pendingReviews, pointsIssued] = await Promise.all([
      this.prisma.user.count({ where: { status: 'ACTIVE', isTest: false } }),
      this.prisma.enrollment.groupBy({ by: ['plan'], _count: true }),
      this.prisma.order.aggregate({ where: { status: 'PAID' }, _sum: { amount: true }, _count: true }),
      this.prisma.order.aggregate({ where: { status: 'REFUNDED' }, _sum: { refundedAmount: true }, _count: true }),
      this.prisma.passVerification.count({ where: { status: 'REVIEWING' } }),
      this.prisma.pointLedgerEntry.aggregate({ where: { amount: { gt: 0 } }, _sum: { amount: true } }),
    ]);
    return {
      activeUsers: users,
      enrollments: Object.fromEntries(enrollments.map((e) => [e.plan, e._count])),
      revenue: { paidCount: paid._count, paidAmount: paid._sum.amount ?? 0, refundedCount: refunded._count, refundedAmount: refunded._sum.refundedAmount ?? 0 },
      pendingReviews, pointsIssued: pointsIssued._sum.amount ?? 0,
    };
  }

  @Get('users')
  users(@Query() q: UserQuery) {
    const where: Prisma.UserWhereInput = q.q ? { OR: [{ email: { contains: q.q, mode: 'insensitive' } }, { nickname: { contains: q.q } }, { id: q.q }] } : {};
    return this.prisma.user.findMany({ where, take: 50, orderBy: { createdAt: 'desc' }, select: { id: true, email: true, nickname: true, role: true, status: true, createdAt: true, isTest: true } });
  }

  @Roles('SUPER_ADMIN') @Patch('users/:id/role')
  async setRole(@CurrentUser() a: AuthUser, @Param('id') id: string, @Body() dto: RoleDto, @Req() req: Request) {
    if (id === a.id) throw new AppError('SELF_ROLE', '본인 권한은 변경할 수 없어요.');
    return this.prisma.$transaction(async (tx) => {
      const before = await tx.user.findUnique({ where: { id } });
      if (!before) throw NotFound('회원');
      const after = await tx.user.update({ where: { id }, data: { role: dto.role } });
      await this.audit.log(tx, { actorId: a.id, action: 'USER_ROLE', targetType: 'User', targetId: id, before: { role: before.role }, after: { role: after.role }, ip: req.ip });
      return { id, role: after.role };
    });
  }

  @Patch('users/:id/status')
  async setStatus(@CurrentUser() a: AuthUser, @Param('id') id: string, @Body() dto: StatusDto, @Req() req: Request) {
    if (dto.status === 'WITHDRAWN') throw new AppError('INVALID_STATUS', '탈퇴는 회원 본인만 할 수 있어요.');
    return this.prisma.$transaction(async (tx) => {
      const before = await tx.user.findUnique({ where: { id } });
      if (!before) throw NotFound('회원');
      if (before.role !== 'USER' && a.role !== 'SUPER_ADMIN') throw new AppError('FORBIDDEN', '관리자 계정은 최고 관리자만 제재할 수 있어요.', 403);
      await tx.user.update({ where: { id }, data: { status: dto.status } });
      if (dto.status === 'SUSPENDED') await tx.refreshToken.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: new Date() } });
      await this.audit.log(tx, { actorId: a.id, action: 'USER_STATUS', targetType: 'User', targetId: id, before: { status: before.status }, after: { status: dto.status, reason: dto.reason }, ip: req.ip });
      return { id, status: dto.status };
    });
  }

  @Get('orders')
  orders(@Query() q: OrderQuery) {
    return this.prisma.order.findMany({ where: q.status ? { status: q.status } : {}, take: 100, orderBy: { createdAt: 'desc' }, include: { user: { select: { id: true, nickname: true } }, events: { orderBy: { createdAt: 'asc' } } } });
  }

  @Roles('SUPER_ADMIN') @Post('orders/:orderNo/refund')
  async refund(@CurrentUser() a: AuthUser, @Param('orderNo') orderNo: string, @Body() dto: RefundDto, @Req() req: Request) {
    const order = await this.prisma.order.findUnique({ where: { orderNo } });
    if (!order) throw NotFound('주문');
    return this.payments.refund(order.id, { reason: `관리자 환불 · ${dto.reason}`, actor: a.id, adminId: a.id, ip: req.ip });
  }

  @Roles('SUPER_ADMIN') @Post('users/:id/points')
  async adjust(@CurrentUser() a: AuthUser, @Param('id') id: string, @Body() dto: AdjustDto, @Req() req: Request) {
    return this.prisma.$transaction(async (tx) => {
      const r = await this.points.post(tx, { userId: id, type: 'ADJUST', amount: dto.amount, reason: `관리자 조정 · ${dto.reason}`, dedupeKey: `adjust:${dto.idempotencyKey}`, createdById: a.id, allowNegative: false });
      if (!r.duplicate) await this.audit.log(tx, { actorId: a.id, action: 'POINT_ADJUST', targetType: 'User', targetId: id, after: { amount: dto.amount, reason: dto.reason, entryId: r.entry.id }, ip: req.ip });
      return { entryId: r.entry.id, balanceAfter: r.entry.balanceAfter, duplicate: r.duplicate };
    });
  }

  @Get('users/:id/points/audit')
  pointAudit(@Param('id') id: string) { return this.points.audit(id); }

  @Get('policy')
  async getPolicy() { return { ...(await this.policy.current()), features: FEATURES, history: await this.prisma.policyVersion.findMany({ orderBy: { createdAt: 'desc' }, take: 20 }) }; }

  @Roles('SUPER_ADMIN') @Post('policy')
  async publishPolicy(@CurrentUser() a: AuthUser, @Body() dto: PolicyDto, @Req() req: Request) {
    const v = dto.values;
    for (const k of ['passPrice', 'togetherReward', 'boosterReward', 'refundDays', 'welcomePoints', 'referralReward'] as const) {
      if (v[k] !== undefined && (!Number.isInteger(v[k]) || (v[k] as number) < 0)) throw new AppError('INVALID_POLICY', `${k} 는 0 이상의 정수여야 해요.`);
    }
    if (v.freeFeatures && !v.freeFeatures.every((f) => (FEATURES as readonly string[]).includes(f))) throw new AppError('INVALID_POLICY', '알 수 없는 기능 코드가 있어요.');
    if (await this.prisma.policyVersion.findUnique({ where: { id: dto.version } })) throw new AppError('POLICY_VERSION_EXISTS', '이미 있는 정책 버전이에요.');
    return this.prisma.$transaction(async (tx) => {
      const r = await this.policy.publish(tx, dto.version, v, a.id);
      await this.audit.log(tx, { actorId: a.id, action: 'POLICY_PUBLISH', targetType: 'PolicyVersion', targetId: dto.version, before: r.before, after: r.after, ip: req.ip });
      return r.after;
    });
  }

  @Post('offerings')
  async createOffering(@CurrentUser() a: AuthUser, @Body() dto: OfferingDto, @Req() req: Request) {
    const { values } = await this.policy.current();
    return this.prisma.$transaction(async (tx) => {
      const o = await tx.challengeOffering.create({ data: { ...dto, recruitEnd: new Date(dto.recruitEnd), examDate: new Date(dto.examDate), freeCap: dto.freeCap ?? values.freeCapDefault, premiumCap: dto.premiumCap ?? values.premiumCapDefault } });
      await this.audit.log(tx, { actorId: a.id, action: 'OFFERING_CREATE', targetType: 'ChallengeOffering', targetId: o.id, after: o, ip: req.ip });
      return o;
    });
  }

  @Patch('offerings/:id')
  async patchOffering(@CurrentUser() a: AuthUser, @Param('id') id: string, @Body() dto: OfferingPatchDto, @Req() req: Request) {
    return this.prisma.$transaction(async (tx) => {
      const before = await tx.challengeOffering.findUnique({ where: { id } });
      if (!before) throw NotFound('챌린지');
      const after = await tx.challengeOffering.update({ where: { id }, data: dto });
      await this.audit.log(tx, { actorId: a.id, action: 'OFFERING_UPDATE', targetType: 'ChallengeOffering', targetId: id, before, after, ip: req.ip });
      return after;
    });
  }

  @Get('audit-logs')
  auditLogs(@Query('targetId') targetId?: string) {
    return this.prisma.adminAuditLog.findMany({ where: targetId ? { targetId } : {}, orderBy: { createdAt: 'desc' }, take: 100, include: { actor: { select: { nickname: true, role: true } } } });
  }
}
