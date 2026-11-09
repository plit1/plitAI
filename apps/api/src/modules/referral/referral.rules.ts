/** 친구 초대 규칙 (데모 RF_POLICY·rfValidate 이관) — 순수 함수 */
import { createHmac } from 'crypto';

export const REWARD_TYPE = 'REFERRAL_FIRST_STUDY';
export const DUP_WINDOW_DAYS = 30;

/** IP·UA 는 원문을 저장하지 않고 키 HMAC 만 저장 (부정 초대 비교용) */
export const fingerprint = (value: string | undefined | null, secret: string) => (value ? createHmac('sha256', `referral:${secret}`).update(value).digest('hex').slice(0, 32) : null);

/** 화면 표시용 익명화 (데모 rfAnon) */
export const anon = (id: string) => `user_••${id.replace(/[^a-z0-9]/gi, '').slice(-3).toLowerCase()}`;
export const maskNickname = (n: string) => (n.length <= 1 ? '*' : n[0] + '*'.repeat(Math.min(n.length - 1, 3)));
export const kstMonth = (d: Date) => new Date(d.getTime() + 9 * 3600_000).toISOString().slice(0, 7);

export interface CheckInput {
  referrerActive: boolean; referrerHasEnrollment: boolean; attributed: boolean; selfReferral: boolean; dupSuspect: boolean;
  enrollmentActive: boolean; hasValidStudy: boolean; alreadyRewarded: boolean; month: { count: number; points: number }; limit: { count: number; points: number }; amount: number;
}
/** 승인 직전 재검증 항목 (데모 rfValidate 9항목 + 추천인 계정 상태) */
export function checks(i: CheckInput) {
  return [
    { key: 'referrer', label: '추천인 계정 정상', ok: i.referrerActive },
    { key: 'eligible', label: '추천인 초대 자격 (챌린지 참여 이력)', ok: i.referrerHasEnrollment },
    { key: 'attributed', label: '추천 코드 최초 귀속', ok: i.attributed },
    { key: 'self', label: '자기추천 아님', ok: !i.selfReferral },
    { key: 'dup', label: '중복 계정 의심 없음', ok: !i.dupSuspect },
    { key: 'enroll', label: '첫 챌린지 참여 유지', ok: i.enrollmentActive },
    { key: 'study', label: '첫 유효 학습 완료 (1분 이상)', ok: i.hasValidStudy },
    { key: 'once', label: '피추천인 평생 1회', ok: !i.alreadyRewarded },
    { key: 'limit', label: `추천인 월 한도 (${i.month.count}/${i.limit.count}건 · ${i.month.points.toLocaleString('ko-KR')}/${i.limit.points.toLocaleString('ko-KR')}P)`, ok: i.month.count < i.limit.count && i.month.points + i.amount <= i.limit.points },
  ];
}
export const failReason = (c: ReturnType<typeof checks>) => c.filter((x) => !x.ok).map((x) => x.label.replace(/\s*\(.*\)$/, '')).join(', ') + ' 미충족';
