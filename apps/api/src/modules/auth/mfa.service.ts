import { HttpStatus, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AppError, Conflict, NotFound } from '../../common/errors';
import { PrismaService } from '../../common/prisma.service';
import { generateTotpSecret, openSecret, otpauthUrl, sealSecret, verifyTotp } from '../../common/totp';

const MFA_TOKEN_TTL = '5m';

@Injectable()
export class MfaService {
  constructor(private readonly prisma: PrismaService, private readonly jwt: JwtService) {}

  /** 1) 등록 시작: 새 시크릿 생성(미활성). 이미 활성이면 거절 — 재등록은 해제 후 */
  async beginEnroll(userId: string) {
    const u = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (u.mfaEnabledAt) throw Conflict('MFA_ALREADY_ENABLED', '이미 2단계 인증을 사용 중이에요.');
    const secret = generateTotpSecret();
    await this.prisma.user.update({ where: { id: userId }, data: { mfaSecret: sealSecret(secret), mfaLastStep: null } });
    return { secret, otpauthUrl: otpauthUrl(secret, u.email ?? u.nickname) };
  }

  /** 2) 앱에 뜬 코드로 확인 → 활성화 */
  async confirmEnroll(userId: string, code: string) {
    const u = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (u.mfaEnabledAt) throw Conflict('MFA_ALREADY_ENABLED', '이미 2단계 인증을 사용 중이에요.');
    if (!u.mfaSecret) throw new AppError('MFA_NOT_STARTED', '2단계 인증 등록을 먼저 시작해주세요.');
    await this.consume(userId, u.mfaSecret, u.mfaLastStep, code);
    await this.prisma.user.update({ where: { id: userId }, data: { mfaEnabledAt: new Date() } });
    return { enabled: true };
  }

  /** 해제: 현재 코드 필요. 해제 시 모든 세션 폐기 (MFA 세션 무효화) */
  async disable(userId: string, code: string) {
    const u = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (!u.mfaEnabledAt || !u.mfaSecret) throw new AppError('MFA_NOT_ENABLED', '2단계 인증을 사용하고 있지 않아요.');
    await this.consume(userId, u.mfaSecret, u.mfaLastStep, code);
    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: userId }, data: { mfaSecret: null, mfaEnabledAt: null, mfaLastStep: null } }),
      this.prisma.refreshToken.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } }),
    ]);
    return { enabled: false };
  }

  async status(userId: string) {
    const u = await this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { mfaEnabledAt: true } });
    return { enabled: !!u.mfaEnabledAt, enabledAt: u.mfaEnabledAt };
  }

  /** 비밀번호 확인 후 발급하는 5분짜리 단계 토큰 (access 토큰으로 사용 불가: typ='mfa') */
  issueStepToken(userId: string) {
    return this.jwt.signAsync({ sub: userId, typ: 'mfa' }, { expiresIn: MFA_TOKEN_TTL });
  }

  async verifyStep(stepToken: string, code: string) {
    const p = await this.jwt.verifyAsync<{ sub?: string; typ?: string }>(stepToken).catch(() => null);
    if (!p || p.typ !== 'mfa' || typeof p.sub !== 'string') throw new AppError('MFA_TOKEN_INVALID', '인증 시간이 지났어요. 다시 로그인해주세요.', HttpStatus.UNAUTHORIZED);
    const u = await this.prisma.user.findUnique({ where: { id: p.sub } });
    if (!u || u.status !== 'ACTIVE' || !u.mfaEnabledAt || !u.mfaSecret) throw new AppError('MFA_TOKEN_INVALID', '다시 로그인해주세요.', HttpStatus.UNAUTHORIZED);
    await this.consume(u.id, u.mfaSecret, u.mfaLastStep, code);
    return u;
  }

  /** 코드 검증 + 같은/이전 시간 단계 재사용 차단 (조건부 업데이트로 동시 사용도 1회만) */
  private async consume(userId: string, sealed: string, lastStep: number | null, code: string) {
    const step = verifyTotp(openSecret(sealed), code);
    if (step == null) throw new AppError('MFA_CODE_INVALID', '인증 코드가 맞지 않아요.', HttpStatus.UNAUTHORIZED);
    if (lastStep != null && step <= lastStep) throw new AppError('MFA_CODE_REUSED', '이미 사용한 코드예요. 다음 코드를 입력해주세요.', HttpStatus.UNAUTHORIZED);
    const { count } = await this.prisma.user.updateMany({ where: { id: userId, OR: [{ mfaLastStep: null }, { mfaLastStep: { lt: step } }] }, data: { mfaLastStep: step } });
    if (count === 0) throw new AppError('MFA_CODE_REUSED', '이미 사용한 코드예요. 다음 코드를 입력해주세요.', HttpStatus.UNAUTHORIZED);
  }

  /** 최고 관리자가 분실 계정 MFA 초기화 (감사 로그는 호출자) */
  async adminReset(targetId: string) {
    const u = await this.prisma.user.findUnique({ where: { id: targetId } });
    if (!u) throw NotFound('회원');
    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: targetId }, data: { mfaSecret: null, mfaEnabledAt: null, mfaLastStep: null } }),
      this.prisma.refreshToken.updateMany({ where: { userId: targetId, revokedAt: null }, data: { revokedAt: new Date() } }),
    ]);
    return { wasEnabled: !!u.mfaEnabledAt };
  }
}
