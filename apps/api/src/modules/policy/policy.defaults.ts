/**
 * 데모 v2.9 bpPolicyDefaults() + 마스터 프롬프트 기본 시나리오.
 * 모든 값은 확정 정책이 아니라 관리자에서 변경 가능한 기본값이다.
 */
export interface PolicyValues {
  passPrice: number; // 플릿 부스터 패스 가격 (원, VAT 포함, 시험 회차당 1회)
  togetherReward: number; // 플릿런 합격 보상 (P)
  boosterReward: number; // 부스터 패스 합격 보상 (P)
  togetherRetryReward: number;
  boosterRetryReward: number;
  retryEnabled: boolean; // 재도전 보상 (기본 미적용)
  refundDays: number; // 결제 후 환불 가능 기간
  welcomePoints: number; // 가입 축하 포인트
  referralReward: number; // 친구 초대 참여 확정 보상
  freeCapDefault: number;
  premiumCapDefault: number;
  pointExpiryDays: number; // 적립 포인트 유효기간 (0 = 만료 없음)
  openRunTarget: number; // 오픈런 개설 심사 기준 관심 인원
  openRunDailyLimit: number; // 회원당 하루 신규 요청 수
  analysisXp: number;
  missionXp: number;
  /** 플릿런(FREE)에서 허용되는 기능. 나머지는 PREMIUM 전용 */
  freeFeatures: string[];
}

export const DEFAULT_POLICY_VERSION = '2026-10-v2.2';

export const DEFAULT_POLICY: PolicyValues = {
  passPrice: 29000,
  togetherReward: 2000,
  boosterReward: 20000,
  togetherRetryReward: 0,
  boosterRetryReward: 0,
  retryEnabled: false,
  refundDays: 7,
  welcomePoints: 3500,
  referralReward: 1000,
  freeCapDefault: 300,
  premiumCapDefault: 300,
  pointExpiryDays: 365,
  openRunTarget: 200,
  openRunDailyLimit: 3,
  analysisXp: 15,
  missionXp: 25,
  freeFeatures: ['TODAY_STUDY', 'BASIC_PROBABILITY', 'STUDY_ROOM', 'COMMUNITY', 'VERIFICATION', 'AI_ROADMAP_BASIC'],
};

/** 기능 코드 (백엔드 권한 검사 키) */
export const FEATURES = [
  'TODAY_STUDY', 'BASIC_PROBABILITY', 'STUDY_ROOM', 'COMMUNITY', 'VERIFICATION', 'AI_ROADMAP_BASIC',
  'QUICK_TEST', 'CLEAR_MODE', 'AI_STRATEGY', 'AI_ROADMAP_EXTENDED', 'DETAILED_RANKING', 'MOCK_EXAM', 'PET_PREMIUM', 'JOB_RECOMMEND_DETAIL',
] as const;
export type Feature = (typeof FEATURES)[number];
