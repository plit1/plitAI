import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import { UserRole } from '@prisma/client';

export interface AuthUser { id: string; role: UserRole; mfa?: boolean; }
export const IS_PUBLIC = 'isPublic';
export const ROLES = 'roles';
/** 로그인 없이 접근 가능한 엔드포인트 */
export const Public = () => SetMetadata(IS_PUBLIC, true);
/** 역할 제한. SUPER_ADMIN 은 OPERATOR 권한을 포함한다. */
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES, roles);
/** 임시 비밀번호 상태에서도 허용 (내 정보·비밀번호 변경·2단계 인증 설정·로그아웃) */
export const ALLOW_PENDING_PASSWORD = 'allowPendingPassword';
export const AllowPendingPassword = () => SetMetadata(ALLOW_PENDING_PASSWORD, true);
export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext): AuthUser => ctx.switchToHttp().getRequest().user);
