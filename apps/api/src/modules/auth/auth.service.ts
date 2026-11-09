import { HttpStatus, Injectable } from '@nestjs/common';
import { AuthProvider, ConsentType, Prisma, User } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { referralCode, randomToken, sha256 } from '../../common/crypto';
import { AppError, Conflict } from '../../common/errors';
import { PrismaService, Tx } from '../../common/prisma.service';
import { PointsService } from '../points/points.service';
import { PolicyService } from '../policy/policy.service';
import { MailService } from './mail.service';
import { SignupDto } from './auth.dto';

export const REQUIRED_CONSENTS: ConsentType[] = ['TERMS', 'PRIVACY', 'AGE_14'];
export const CONSENT_VERSION = '2026-11-v1';
const BCRYPT_ROUNDS = 12;
// 존재하지 않는 계정에도 같은 비용의 비교를 수행해 응답 시간으로 계정 존재 여부가 드러나지 않게 함
const DUMMY_HASH = bcrypt.hashSync('plit-dummy-password', BCRYPT_ROUNDS);

@Injectable()
export class AuthService {
  constructor(private readonly prisma: PrismaService, private readonly points: PointsService, private readonly policy: PolicyService, private readonly mail: MailService) {}

  async signup(dto: SignupDto): Promise<User> {
    const missing = REQUIRED_CONSENTS.filter((c) => !dto.consents.includes(c));
    if (missing.length) throw new AppError('CONSENT_REQUIRED', '필수 약관에 동의해주세요.', HttpStatus.BAD_REQUEST, { missing });
    const email = dto.email.trim().toLowerCase();
    if (await this.prisma.user.findUnique({ where: { email } })) throw Conflict('EMAIL_TAKEN', '이미 가입된 이메일이에요.');
    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);

    try {
      return await this.prisma.$transaction(async (tx) => {
        const referrer = dto.referralCode ? await tx.user.findUnique({ where: { referralCode: dto.referralCode.toUpperCase() } }) : null;
        const user = await this.createUser(tx, { email, passwordHash, nickname: dto.nickname.trim(), referredById: referrer?.id }, dto.consents);
        await tx.authIdentity.create({ data: { userId: user.id, provider: 'EMAIL', providerUserId: email, email } });
        return user;
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') throw Conflict('EMAIL_TAKEN', '이미 가입된 이메일이에요.');
      throw e;
    }
  }

  /** 공통 회원 생성: 추천코드 발급, 동의 이력, 가입 축하 포인트 */
  async createUser(tx: Tx, data: { email?: string | null; passwordHash?: string | null; nickname: string; referredById?: string; emailVerified?: boolean }, consents: ConsentType[]) {
    const { values } = await this.policy.current(tx);
    let user: User | null = null;
    for (let i = 0; i < 5 && !user; i++) {
      const code = referralCode();
      if (await tx.user.findUnique({ where: { referralCode: code } })) continue;
      user = await tx.user.create({ data: { email: data.email ?? null, passwordHash: data.passwordHash ?? null, nickname: data.nickname, referralCode: code, referredById: data.referredById, emailVerified: data.emailVerified ?? false } });
    }
    if (!user) throw new Error('추천코드 생성 실패');
    const all: ConsentType[] = ['TERMS', 'PRIVACY', 'AGE_14', 'MARKETING', 'STUDY_DATA_ANALYTICS'];
    await tx.userConsent.createMany({ data: all.map((type) => ({ userId: user!.id, type, version: CONSENT_VERSION, agreed: consents.includes(type) })) });
    if (values.welcomePoints > 0) {
      await this.points.post(tx, { userId: user.id, type: 'EARN', amount: values.welcomePoints, reason: '가입 축하 포인트', dedupeKey: `welcome:${user.id}`, refType: 'USER', refId: user.id });
    }
    return user;
  }

  async validateLogin(emailRaw: string, password: string): Promise<User> {
    const user = await this.prisma.user.findUnique({ where: { email: emailRaw.trim().toLowerCase() } });
    const ok = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH);
    if (!user || !user.passwordHash || !ok) throw new AppError('INVALID_CREDENTIALS', '이메일 또는 비밀번호가 맞지 않아요.', HttpStatus.UNAUTHORIZED);
    if (user.status === 'SUSPENDED') throw new AppError('ACCOUNT_SUSPENDED', '이용이 제한된 계정이에요.', HttpStatus.FORBIDDEN);
    if (user.status !== 'ACTIVE') throw new AppError('INVALID_CREDENTIALS', '이메일 또는 비밀번호가 맞지 않아요.', HttpStatus.UNAUTHORIZED);
    return user;
  }

  /** 계정 존재 여부와 무관하게 동일 응답 (계정 열거 방지) */
  async requestPasswordReset(emailRaw: string) {
    const user = await this.prisma.user.findUnique({ where: { email: emailRaw.trim().toLowerCase() } });
    if (!user || user.status !== 'ACTIVE') return;
    const token = randomToken(32);
    await this.prisma.passwordResetToken.create({ data: { userId: user.id, tokenHash: sha256(token), expiresAt: new Date(Date.now() + 30 * 60000) } });
    await this.mail.send(user.email!, '[PLIT] 비밀번호 재설정 안내', `아래 링크에서 30분 안에 비밀번호를 재설정해주세요.\n/reset-password?token=${token}`);
  }

  async confirmPasswordReset(token: string, password: string) {
    const row = await this.prisma.passwordResetToken.findUnique({ where: { tokenHash: sha256(token) } });
    if (!row || row.usedAt || row.expiresAt < new Date()) throw new AppError('INVALID_RESET_TOKEN', '링크가 만료되었거나 이미 사용되었어요.');
    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    await this.prisma.$transaction([
      this.prisma.passwordResetToken.update({ where: { id: row.id }, data: { usedAt: new Date() } }),
      this.prisma.user.update({ where: { id: row.userId }, data: { passwordHash } }),
      this.prisma.refreshToken.updateMany({ where: { userId: row.userId, revokedAt: null }, data: { revokedAt: new Date() } }),
    ]);
  }

  /**
   * 소셜 로그인: (provider, providerUserId) 로 기존 연결 조회 → 없으면 신규 가입.
   * 같은 이메일의 기존 계정이 있어도 자동 병합하지 않는다 (계정 탈취 방지) → 로그인 후 '계정 연결'로만 병합.
   */
  async loginWithIdentity(provider: AuthProvider, profile: { providerUserId: string; email?: string | null; nickname?: string | null }, consents: ConsentType[]) {
    const found = await this.prisma.authIdentity.findUnique({ where: { provider_providerUserId: { provider, providerUserId: profile.providerUserId } }, include: { user: true } });
    if (found) {
      if (found.user.status !== 'ACTIVE') throw new AppError('ACCOUNT_UNAVAILABLE', '이용할 수 없는 계정이에요.', HttpStatus.FORBIDDEN);
      return { user: found.user, created: false };
    }
    const email = profile.email?.toLowerCase() ?? null;
    if (email && (await this.prisma.user.findUnique({ where: { email } }))) {
      throw Conflict('EMAIL_LINK_REQUIRED', '이미 같은 이메일로 가입된 계정이 있어요. 기존 계정으로 로그인한 뒤 마이페이지에서 계정을 연결해주세요.');
    }
    const missing = REQUIRED_CONSENTS.filter((c) => !consents.includes(c));
    if (missing.length) throw new AppError('CONSENT_REQUIRED', '필수 약관에 동의해주세요.', HttpStatus.BAD_REQUEST, { missing });
    const user = await this.prisma.$transaction(async (tx) => {
      const u = await this.createUser(tx, { email, nickname: (profile.nickname || '플릿러').slice(0, 12), emailVerified: !!email }, consents);
      await tx.authIdentity.create({ data: { userId: u.id, provider, providerUserId: profile.providerUserId, email } });
      return u;
    });
    return { user, created: true };
  }

  async linkIdentity(userId: string, provider: AuthProvider, providerUserId: string, email?: string | null) {
    const found = await this.prisma.authIdentity.findUnique({ where: { provider_providerUserId: { provider, providerUserId } } });
    if (found && found.userId !== userId) throw Conflict('IDENTITY_IN_USE', '이미 다른 PLIT 계정에 연결된 소셜 계정이에요.');
    if (found) return found;
    return this.prisma.authIdentity.create({ data: { userId, provider, providerUserId, email: email ?? null } });
  }
}
