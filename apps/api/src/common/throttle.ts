/** 요청 제한 값. 테스트에서는 THROTTLE_STRICT=1 일 때만 실제 한도를 적용 (런타임 평가) */
export const limit = (n: number) => () => (process.env.NODE_ENV === 'test' && process.env.THROTTLE_STRICT !== '1' ? 100_000 : n);
