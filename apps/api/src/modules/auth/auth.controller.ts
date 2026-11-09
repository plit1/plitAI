import { Body, Controller, Get, HttpCode, Param, Post, Query, Req, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { ConsentType } from '@prisma/client';
import type { Request, Response } from 'express';
import { AuthUser, CurrentUser, Public } from '../../common/auth.decorators';
import { AppError } from '../../common/errors';
import { limit } from '../../common/throttle';
import { LoginDto, MfaCodeDto, MfaLoginDto, PasswordResetConfirmDto, PasswordResetRequestDto, SignupDto } from './auth.dto';
import { MfaService } from './mfa.service';
import { AuthService } from './auth.service';
import { OAuthService } from './oauth.service';
import { IssuedTokens, TokenService } from './token.service';

export const REFRESH_COOKIE = 'plit_rt';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService, private readonly tokens: TokenService, private readonly oauth: OAuthService, private readonly config: ConfigService, private readonly mfa: MfaService) {}

  private meta(req: Request) { return { ua: req.headers['user-agent'], ip: req.ip }; }

  private respond(res: Response, t: IssuedTokens, user: { id: string; nickname: string; role: string }) {
    res.cookie(REFRESH_COOKIE, t.refreshToken, {
      httpOnly: true, secure: this.config.get('NODE_ENV') === 'production', sameSite: 'strict',
      path: '/api/v1/auth', expires: t.refreshExpiresAt,
    });
    return { accessToken: t.accessToken, user: { id: user.id, nickname: user.nickname, role: user.role } };
  }

  @Public() @Throttle({ default: { limit: limit(5), ttl: 60_000 } })
  @Post('signup')
  async signup(@Body() dto: SignupDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const user = await this.auth.signup(dto);
    return this.respond(res, await this.tokens.issue(user, this.meta(req)), user);
  }

  @Public() @Throttle({ default: { limit: limit(10), ttl: 60_000 } }) @HttpCode(200)
  @Post('login')
  async login(@Body() dto: LoginDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const user = await this.auth.validateLogin(dto.email, dto.password);
    // 2단계 인증 사용자: 토큰 대신 5분짜리 단계 토큰만 발급
    if (user.mfaEnabledAt) return { mfaRequired: true, mfaToken: await this.mfa.issueStepToken(user.id) };
    return this.respond(res, await this.tokens.issue(user, this.meta(req)), user);
  }

  @Public() @Throttle({ default: { limit: limit(10), ttl: 60_000 } }) @HttpCode(200)
  @Post('login/mfa')
  async loginMfa(@Body() dto: MfaLoginDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const user = await this.mfa.verifyStep(dto.mfaToken, dto.code);
    return this.respond(res, await this.tokens.issue(user, this.meta(req), { mfa: true }), user);
  }

  @Get('mfa') mfaStatus(@CurrentUser() u: AuthUser) { return this.mfa.status(u.id); }
  @Post('mfa/enroll') mfaEnroll(@CurrentUser() u: AuthUser) { return this.mfa.beginEnroll(u.id); }
  @Throttle({ default: { limit: limit(10), ttl: 60_000 } }) @HttpCode(200)
  @Post('mfa/confirm') mfaConfirm(@CurrentUser() u: AuthUser, @Body() dto: MfaCodeDto) { return this.mfa.confirmEnroll(u.id, dto.code); }
  @Throttle({ default: { limit: limit(10), ttl: 60_000 } }) @HttpCode(200)
  @Post('mfa/disable') mfaDisable(@CurrentUser() u: AuthUser, @Body() dto: MfaCodeDto) { return this.mfa.disable(u.id, dto.code); }

  @Public() @HttpCode(200)
  @Post('refresh')
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const raw = req.cookies?.[REFRESH_COOKIE];
    if (!raw) throw new AppError('INVALID_REFRESH', '다시 로그인해주세요.', 401);
    const t = await this.tokens.rotate(raw, this.meta(req));
    const payload = JSON.parse(Buffer.from(t.accessToken.split('.')[1], 'base64url').toString());
    res.cookie(REFRESH_COOKIE, t.refreshToken, { httpOnly: true, secure: this.config.get('NODE_ENV') === 'production', sameSite: 'strict', path: '/api/v1/auth', expires: t.refreshExpiresAt });
    return { accessToken: t.accessToken, userId: payload.sub };
  }

  @Public() @HttpCode(204)
  @Post('logout')
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const raw = req.cookies?.[REFRESH_COOKIE];
    if (raw) await this.tokens.revoke(raw);
    res.clearCookie(REFRESH_COOKIE, { path: '/api/v1/auth' });
  }

  @Public() @Throttle({ default: { limit: limit(3), ttl: 60_000 } }) @HttpCode(202)
  @Post('password-reset/request')
  async resetRequest(@Body() dto: PasswordResetRequestDto) {
    await this.auth.requestPasswordReset(dto.email);
    return { message: '가입된 이메일이라면 재설정 안내를 보냈어요.' };
  }

  @Public() @HttpCode(204)
  @Post('password-reset/confirm')
  async resetConfirm(@Body() dto: PasswordResetConfirmDto) {
    await this.auth.confirmPasswordReset(dto.token, dto.password);
  }

  @Public()
  @Get('providers')
  providers() { return { email: true, social: this.oauth.enabledProviders() }; }

  /** 소셜 로그인 시작: 동의 항목을 state 에 담아 provider 로 이동 */
  @Public()
  @Get('oauth/:provider/start')
  async oauthStart(@Param('provider') raw: string, @Query('consents') consents = '', @Query('redirect') redirect = '/', @Res() res: Response) {
    const p = this.oauth.parseProvider(raw);
    const list = consents.split(',').filter((c): c is ConsentType => c in ConsentType);
    res.redirect(302, await this.oauth.authorizeUrl(p, list, redirect));
  }

  @Public()
  @Get('oauth/:provider/callback')
  async oauthCallback(@Param('provider') raw: string, @Query('code') code: string, @Query('state') state: string, @Req() req: Request, @Res() res: Response) {
    const p = this.oauth.parseProvider(raw);
    const origin = this.config.get<string>('APP_ORIGIN');
    try {
      const s = await this.oauth.verifyState(p, state);
      const profile = await this.oauth.exchange(p, code, state);
      if (s.mode === 'link' && s.uid) {
        await this.auth.linkIdentity(s.uid, p, profile.providerUserId, profile.email);
        return res.redirect(302, `${origin}/my/account?linked=${p}`);
      }
      const { user } = await this.auth.loginWithIdentity(p, profile, s.consents);
      if (user.mfaEnabledAt) {
        const mfaToken = await this.mfa.issueStepToken(user.id);
        return res.redirect(302, `${origin}/login/mfa#token=${encodeURIComponent(mfaToken)}&next=${encodeURIComponent(s.redirect)}`);
      }
      const t = await this.tokens.issue(user, this.meta(req));
      this.respond(res, t, user);
      res.redirect(302, `${origin}/auth/callback?next=${encodeURIComponent(s.redirect)}`);
    } catch (e) {
      const code = e instanceof AppError ? e.code : 'OAUTH_FAILED';
      res.redirect(302, `${origin}/login?error=${code}`);
      return;
    }
  }

  @Get('me')
  me(@CurrentUser() user: AuthUser) { return user; }
}
