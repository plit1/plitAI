import { Controller, Delete, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser, CurrentUser } from '../../common/auth.decorators';
import { AuthService } from './auth.service';
import { OAuthService } from './oauth.service';

/** 로그인 상태에서 소셜 계정 연결·해제. 연결 시작은 URL 을 돌려주고 프런트가 이동 (Bearer 헤더는 리다이렉트로 전달 불가) */
@ApiTags('me')
@ApiBearerAuth()
@Controller('me/identities')
export class IdentitiesController {
  constructor(private readonly auth: AuthService, private readonly oauth: OAuthService) {}

  @Get() list(@CurrentUser() u: AuthUser) { return this.auth.listIdentities(u.id); }

  @Post(':provider/link')
  async link(@CurrentUser() u: AuthUser, @Param('provider') raw: string, @Query('redirect') redirect = '/my/account') {
    const p = this.oauth.parseProvider(raw);
    return { url: await this.oauth.authorizeUrl(p, [], redirect, { uid: u.id }) };
  }

  @HttpCode(204) @Delete(':provider')
  async unlink(@CurrentUser() u: AuthUser, @Param('provider') raw: string) {
    await this.auth.unlinkIdentity(u.id, raw.toUpperCase() === 'EMAIL' ? 'EMAIL' : this.oauth.parseProvider(raw));
  }
}
