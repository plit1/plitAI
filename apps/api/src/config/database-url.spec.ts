import { assembleDatabaseUrl } from './database-url';
it('RDS 관리 시크릿으로 DATABASE_URL 조립 (특수문자 인코딩)', () => {
  const env: NodeJS.ProcessEnv = { DB_HOST: 'db.internal', DB_CREDENTIALS: JSON.stringify({ username: 'plit', password: 'p@ss/w:rd' }) };
  assembleDatabaseUrl(env);
  expect(env.DATABASE_URL).toBe('postgresql://plit:p%40ss%2Fw%3Ard@db.internal:5432/plit?schema=public&sslmode=require');
});
it('DATABASE_URL 이 이미 있으면 변경하지 않음', () => {
  const env: NodeJS.ProcessEnv = { DATABASE_URL: 'postgresql://x', DB_HOST: 'h', DB_CREDENTIALS: '{}' };
  assembleDatabaseUrl(env);
  expect(env.DATABASE_URL).toBe('postgresql://x');
});
