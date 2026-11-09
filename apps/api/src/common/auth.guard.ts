import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { UserRole } from '@prisma/client';
import { Forbidden } from './errors';
import { AuthUser, IS_PUBLIC, ROLES } from './auth.decorators';
import { PrismaService } from './prisma.service';

const RANK: Record<UserRole, number> = { USER: 0, OPERATOR: 1, SUPER_ADMIN: 2 };

/** 전역 가드: 기본은 로그인 필수. @Public() 만 예외. 역할은 DB 최신값으로 재확인(정지·탈퇴 즉시 반영). */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly reflector: Reflector, private readonly jwt: JwtService, private readonly prisma: PrismaService) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const targets = [ctx.getHandler(), ctx.getClass()];
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, targets);
    const req = ctx.switchToHttp().getRequest();
    const header: string | undefined = req.headers.authorization;
    const token = header?.startsWith('Bearer ') ? header.slice(7) : undefined;

    if (token) {
      const payload = await this.jwt.verifyAsync<{ sub: string }>(token).catch(() => null);
      if (!payload && !isPublic) throw new UnauthorizedException();
      if (payload) {
        const user = await this.prisma.user.findUnique({ where: { id: payload.sub }, select: { id: true, role: true, status: true } });
        if (user?.status === 'ACTIVE') req.user = { id: user.id, role: user.role } satisfies AuthUser;
        else if (user?.status === 'SUSPENDED' && !isPublic) throw Forbidden('ACCOUNT_SUSPENDED', '이용이 제한된 계정이에요.');
      }
    }
    if (isPublic) return true;
    if (!req.user) throw new UnauthorizedException();

    const roles = this.reflector.getAllAndOverride<UserRole[]>(ROLES, targets);
    if (roles?.length) {
      const min = Math.min(...roles.map((r) => RANK[r]));
      if (RANK[req.user.role as UserRole] < min) throw Forbidden('FORBIDDEN', '권한이 없어요.');
    }
    return true;
  }
}
