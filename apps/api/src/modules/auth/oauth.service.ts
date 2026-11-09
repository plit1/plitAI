import { HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { AuthProvider, ConsentType } from '@prisma/client';
import { randomToken } from '../../common/crypto';
import { AppError } from '../../common/errors';

type SocialProvider = Exclude<AuthProvider, 'EMAIL'>;
export interface SocialProfile { providerUserId: string; email?: string | null; nickname?: string | null; }

interface ProviderSpec {
  authorizeUrl: string;
  tokenUrl: string;
  profileUrl: string;
  scope: string;
  idKey: 'KAKAO' | 'NAVER' | 'GOOGLE';
  parse(json: any): SocialProfile;
}

/** 공식 문서 기준 엔드포인트 (카카오 REST, 네이버 로그인 API, Google OAuth 2.0) */
const SPECS: Record<SocialProvider, ProviderSpec> = {
  KAKAO: {
    authorizeUrl: 'https://kauth.kakao.com/oauth/authorize', tokenUrl: 'https://kauth.kakao.com/oauth/token',
    profileUrl: 'https://kapi.kakao.com/v2/user/me', scope: 'profile_nickname account_email', idKey: 'KAKAO',
    parse: (j) => ({ providerUserId: String(j.id), email: j.kakao_account?.is_email_verified ? j.kakao_account?.email : null, nickname: j.kakao_account?.profile?.nickname ?? j.properties?.nickname }),
  },
  NAVER: {
    authorizeUrl: 'https://nid.naver.com/oauth2.0/authorize', tokenUrl: 'https://nid.naver.com/oauth2.0/token',
    profileUrl: 'https://openapi.naver.com/v1/nid/me', scope: '', idKey: 'NAVER',
    parse: (j) => ({ providerUserId: String(j.response?.id), email: j.response?.email ?? null, nickname: j.response?.nickname ?? j.response?.name }),
  },
  GOOGLE: {
    authorizeUrl: 'https://accounts.google.com/o/oauth2/v2/auth', tokenUrl: 'https://oauth2.googleapis.com/token',
    profileUrl: 'https://openidconnect.googleapis.com/v1/userinfo', scope: 'openid email profile', idKey: 'GOOGLE',
    parse: (j) => ({ providerUserId: String(j.sub), email: j.email_verified ? j.email : null, nickname: j.name }),
  },
};

export interface OAuthState { p: SocialProvider; consents: ConsentType[]; redirect: string; n: string; mode?: 'login' | 'link'; uid?: string; }

/** 외부 HTTP 호출은 테스트에서 교체할 수 있도록 분리 */
export type HttpFetch = (url: string, init?: RequestInit) => Promise<{ ok: boolean; status: number; json(): Promise<any> }>;

@Injectable()
export class OAuthService {
  http: HttpFetch = (url, init) => fetch(url, init);
  constructor(private readonly config: ConfigService, private readonly jwt: JwtService) {}

  parseProvider(raw: string): SocialProvider {
    const p = raw.toUpperCase();
    if (p !== 'KAKAO' && p !== 'NAVER' && p !== 'GOOGLE') throw new AppError('UNKNOWN_PROVIDER', '지원하지 않는 로그인 방식이에요.', HttpStatus.NOT_FOUND);
    return p;
  }

  private creds(p: SocialProvider) {
    const id = this.config.get<string>(`${p}_CLIENT_ID`);
    const secret = this.config.get<string>(`${p}_CLIENT_SECRET`);
    if (!id) throw new AppError('PROVIDER_NOT_CONFIGURED', '아직 준비 중인 로그인 방식이에요.', HttpStatus.SERVICE_UNAVAILABLE);
    return { id, secret: secret ?? '' };
  }

  enabledProviders(): SocialProvider[] {
    return (Object.keys(SPECS) as SocialProvider[]).filter((p) => !!this.config.get(`${p}_CLIENT_ID`));
  }

  private redirectUri(p: SocialProvider) { return `${this.config.get('OAUTH_REDIRECT_BASE')}/${p.toLowerCase()}/callback`; }

  async authorizeUrl(p: SocialProvider, consents: ConsentType[], redirect: string, link?: { uid: string }) {
    const { id } = this.creds(p);
    const safeRedirect = redirect.startsWith('/') && !redirect.startsWith('//') ? redirect : '/';
    const state = await this.jwt.signAsync({ p, consents, redirect: safeRedirect, n: randomToken(8), typ: 'oauth_state', ...(link ? { mode: 'link', uid: link.uid } : { mode: 'login' }) }, { expiresIn: '10m' });
    const q = new URLSearchParams({ response_type: 'code', client_id: id, redirect_uri: this.redirectUri(p), state });
    if (SPECS[p].scope) q.set('scope', SPECS[p].scope);
    return `${SPECS[p].authorizeUrl}?${q}`;
  }

  async verifyState(p: SocialProvider, state: string): Promise<OAuthState> {
    const s = await this.jwt.verifyAsync<OAuthState & { typ?: string }>(state).catch(() => null);
    if (!s || s.typ !== 'oauth_state' || s.p !== p) throw new AppError('INVALID_OAUTH_STATE', '로그인 요청이 만료되었어요. 다시 시도해주세요.', HttpStatus.BAD_REQUEST);
    return s;
  }

  async exchange(p: SocialProvider, code: string, state: string): Promise<SocialProfile> {
    const { id, secret } = this.creds(p);
    const body = new URLSearchParams({ grant_type: 'authorization_code', client_id: id, client_secret: secret, code, redirect_uri: this.redirectUri(p), state });
    const tokenRes = await this.http(SPECS[p].tokenUrl, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body });
    const token = await tokenRes.json();
    if (!tokenRes.ok || !token.access_token) throw new AppError('OAUTH_EXCHANGE_FAILED', '소셜 로그인에 실패했어요.', HttpStatus.BAD_GATEWAY);
    const profRes = await this.http(SPECS[p].profileUrl, { headers: { Authorization: `Bearer ${token.access_token}` } });
    if (!profRes.ok) throw new AppError('OAUTH_PROFILE_FAILED', '소셜 계정 정보를 가져오지 못했어요.', HttpStatus.BAD_GATEWAY);
    const profile = SPECS[p].parse(await profRes.json());
    if (!profile.providerUserId || profile.providerUserId === 'undefined') throw new AppError('OAUTH_PROFILE_FAILED', '소셜 계정 정보를 가져오지 못했어요.', HttpStatus.BAD_GATEWAY);
    return profile;
  }
}
