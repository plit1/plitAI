import { plainToInstance, Transform } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsOptional, IsString, MinLength, validateSync } from 'class-validator';

/** 환경변수 스키마. 기동 시 검증 실패하면 서버를 띄우지 않는다. */
export class Env {
  @IsIn(['development', 'test', 'staging', 'production']) NODE_ENV = 'development';
  @Transform(({ value }) => Number(value)) @IsInt() PORT = 4000;
  @IsString() APP_ORIGIN = 'http://localhost:3000';
  @IsString() DATABASE_URL: string;
  @IsString() @MinLength(32) JWT_ACCESS_SECRET: string;
  @IsString() JWT_ACCESS_TTL = '15m';
  @Transform(({ value }) => Number(value)) @IsInt() REFRESH_TTL_DAYS = 30;

  /** 미설정 시 production·staging 은 true, 그 외 false */
  @IsOptional() @Transform(({ value }) => value === true || value === 'true') @IsBoolean() ADMIN_MFA_REQUIRED?: boolean;
  @IsOptional() @IsString() MFA_ENC_KEY?: string;

  @IsIn(['MOCK', 'TOSS']) PAYMENT_PROVIDER: 'MOCK' | 'TOSS' = 'MOCK';
  @IsOptional() @IsString() TOSS_SECRET_KEY?: string;
  @IsOptional() @IsString() TOSS_CLIENT_KEY?: string;

  @Transform(({ value }) => value === true || value === 'true') @IsBoolean() REWARDS_LIVE = false;

  @IsOptional() @IsString() KAKAO_CLIENT_ID?: string;
  @IsOptional() @IsString() KAKAO_CLIENT_SECRET?: string;
  @IsOptional() @IsString() NAVER_CLIENT_ID?: string;
  @IsOptional() @IsString() NAVER_CLIENT_SECRET?: string;
  @IsOptional() @IsString() GOOGLE_CLIENT_ID?: string;
  @IsOptional() @IsString() GOOGLE_CLIENT_SECRET?: string;
  @IsString() OAUTH_REDIRECT_BASE = 'http://localhost:4000/api/v1/auth/oauth';

  @IsOptional() @IsString() ANTHROPIC_API_KEY?: string;
  @IsString() AI_MODEL = 'claude-sonnet-5-5';
  @Transform(({ value }) => Number(value)) @IsInt() AI_DAILY_LIMIT_FREE = 3;
  @Transform(({ value }) => Number(value)) @IsInt() AI_DAILY_LIMIT_PREMIUM = 30;
}

export function validateEnv(raw: Record<string, unknown>): Env {
  const cleaned = Object.fromEntries(Object.entries(raw).filter(([, v]) => v !== ''));
  const env = plainToInstance(Env, cleaned, { enableImplicitConversion: false, exposeDefaultValues: true });
  const errors = validateSync(env, { skipMissingProperties: false, whitelist: false });
  if (errors.length) {
    throw new Error('환경변수 오류:\n' + errors.map((e) => ` - ${e.property}: ${Object.values(e.constraints ?? {}).join(', ')}`).join('\n'));
  }
  env.ADMIN_MFA_REQUIRED ??= env.NODE_ENV === 'production' || env.NODE_ENV === 'staging';
  if (env.NODE_ENV === 'production' && !env.ADMIN_MFA_REQUIRED) throw new Error('운영 환경에서 관리자 MFA 를 끌 수 없습니다.');
  if (env.NODE_ENV === 'production' && !env.MFA_ENC_KEY) throw new Error('운영 환경에는 MFA_ENC_KEY 가 필요합니다.');
  if (env.NODE_ENV === 'production') {
    if (env.JWT_ACCESS_SECRET.startsWith('change-me')) throw new Error('운영 환경에서 기본 JWT 시크릿을 사용할 수 없습니다.');
    if (env.PAYMENT_PROVIDER === 'MOCK') throw new Error('운영 환경에서는 MOCK 결제를 사용할 수 없습니다.');
  }
  if (env.PAYMENT_PROVIDER === 'TOSS' && !env.TOSS_SECRET_KEY) throw new Error('PAYMENT_PROVIDER=TOSS 인데 TOSS_SECRET_KEY 가 없습니다.');
  return env;
}
