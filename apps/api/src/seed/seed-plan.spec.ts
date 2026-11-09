import { seedPlan } from './seed-plan';

describe('시드 범위', () => {
  it('스테이징: 데모 공고·지원사업은 넣고 개발 계정은 만들지 않음', () => {
    expect(seedPlan({ NODE_ENV: 'staging' })).toMatchObject({ demoContent: true, devUsers: false });
    expect(seedPlan({ NODE_ENV: 'staging', SEED_DEV_USERS: 'true' }).devUsers).toBe(false);
    expect(seedPlan({ NODE_ENV: 'staging', SEED_DEMO_CONTENT: 'false' }).demoContent).toBe(false);
  });
  it('운영·알 수 없는 환경: 데모 콘텐츠·개발 계정 모두 금지', () => {
    for (const NODE_ENV of ['production', 'prod', 'Production']) expect(seedPlan({ NODE_ENV, SEED_DEMO_CONTENT: 'true', SEED_DEV_USERS: 'true' })).toMatchObject({ demoContent: false, devUsers: false });
  });
  it('로컬·테스트: 둘 다 (끌 수 있음)', () => {
    expect(seedPlan({})).toMatchObject({ mode: 'development', demoContent: true, devUsers: true });
    expect(seedPlan({ NODE_ENV: 'test', SEED_DEV_USERS: 'false' }).devUsers).toBe(false);
  });
});
