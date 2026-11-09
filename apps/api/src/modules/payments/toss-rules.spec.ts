import { validateEnv } from '../../config/env';
import { customerKeyFor, ORDER_ID_RULE } from './payments.service';

describe('토스 연동 규칙', () => {
  it('customerKey: 2~50자, 허용 문자만, 특수문자 1개 이상, 회원별 고정·회원 ID 비노출', () => {
    const k = customerKeyFor('cmw9a2le6000j7dg2wsryabb8');
    expect(k).toMatch(/^[A-Za-z0-9_=.@-]{2,50}$/);
    expect(k).toMatch(/[-_=.@]/);
    expect(k).not.toContain('cmw9a2le6000j7dg2wsryabb8');
    expect(customerKeyFor('cmw9a2le6000j7dg2wsryabb8')).toBe(k);
    expect(customerKeyFor('other')).not.toBe(k);
  });
  it('주문번호 형식이 토스 orderId 규칙에 맞음', () => {
    expect('PLIT-MHABC123-X9Y8Z7').toMatch(ORDER_ID_RULE);
    expect('abc').not.toMatch(ORDER_ID_RULE);
    expect('한글주문번호123').not.toMatch(ORDER_ID_RULE);
  });
  const base = { NODE_ENV: 'development', DATABASE_URL: 'postgresql://x', JWT_ACCESS_SECRET: 'x'.repeat(40) };
  it('위젯 클라이언트 키는 gck 만 허용', () => {
    expect(() => validateEnv({ ...base, TOSS_CLIENT_KEY: 'test_ck_abc' })).toThrow(/test_gck_/);
    expect(() => validateEnv({ ...base, TOSS_CLIENT_KEY: 'test_gck_abc' })).not.toThrow();
  });
  it('live 키는 production 에서만, production 은 live 키 필수 (실결제 사고 방지)', () => {
    expect(() => validateEnv({ ...base, NODE_ENV: 'staging', PAYMENT_PROVIDER: 'TOSS', TOSS_CLIENT_KEY: 'live_gck_x', TOSS_SECRET_KEY: 'live_sk_x' })).toThrow(/production/);
    expect(() => validateEnv({ ...base, NODE_ENV: 'staging', PAYMENT_PROVIDER: 'TOSS', TOSS_CLIENT_KEY: 'test_gck_x', TOSS_SECRET_KEY: 'test_sk_x' })).not.toThrow();
    expect(() => validateEnv({ ...base, NODE_ENV: 'production', JWT_ACCESS_SECRET: 'p'.repeat(40), MFA_ENC_KEY: 'a'.repeat(64), STORAGE_DRIVER: 's3', S3_UPLOAD_BUCKET: 'b', PAYMENT_PROVIDER: 'TOSS', TOSS_CLIENT_KEY: 'test_gck_x', TOSS_SECRET_KEY: 'test_sk_x' })).toThrow(/live 결제 키/);
  });
});
