/**
 * AWS 배포: RDS 관리 시크릿(DB_CREDENTIALS = {"username","password"}) + DB_HOST 로 DATABASE_URL 조립.
 * main.ts 에서 AppModule 보다 먼저 import 되어야 한다 (ConfigModule 검증 전에 실행).
 */
export function assembleDatabaseUrl(env: NodeJS.ProcessEnv = process.env) {
  if (env.DATABASE_URL || !env.DB_HOST || !env.DB_CREDENTIALS) return;
  const { username, password } = JSON.parse(env.DB_CREDENTIALS) as { username: string; password: string };
  env.DATABASE_URL = `postgresql://${encodeURIComponent(username)}:${encodeURIComponent(password)}@${env.DB_HOST}:${env.DB_PORT || 5432}/${env.DB_NAME || 'plit'}?schema=public&sslmode=require`;
}
assembleDatabaseUrl();
