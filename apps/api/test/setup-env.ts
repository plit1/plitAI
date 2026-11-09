// 테스트는 항상 plit_test DB를 사용 (개발 DB와 혼용 금지)
import { readFileSync } from 'fs';
import { join } from 'path';
const file = join(__dirname, '..', '.env.test');
try {
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2];
  }
} catch { /* CI 에서는 환경변수로 주입 */ }
process.env.NODE_ENV = 'test';
if (!process.env.DATABASE_URL?.includes('test')) {
  throw new Error('테스트는 이름에 "test"가 포함된 DB에서만 실행할 수 있습니다: ' + process.env.DATABASE_URL);
}
