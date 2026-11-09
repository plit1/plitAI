# 시스템 아키텍처

## 전체 구조
```
[브라우저] ──HTTPS──> [CloudFront/Next.js(apps/web)] ──/api 프록시──> [ALB] ──> [ECS Fargate: apps/api (NestJS)]
                                                                                    │        │         │
                                                                             [RDS PostgreSQL] [S3 증빙] [Secrets Manager]
                                                                                    │
                                                         외부: 토스페이먼츠 · 카카오/네이버/구글 OAuth · 고용24 · K-Startup · Claude API
```
- 웹과 API 를 **같은 오리진(/api)** 으로 묶어 refresh 쿠키를 `SameSite=Strict; HttpOnly` 로 유지 (CSRF 표면 최소화).
- API 는 **모듈형 모놀리스**. 모듈 간 호출은 서비스 주입, 트랜잭션은 호출자가 `tx` 로 전달.

## API 모듈 (apps/api/src/modules)
| 모듈 | 책임 | 상태 |
|---|---|---|
| auth | 이메일 가입/로그인, 회전식 refresh, 재설정, OAuth(카카오·네이버·구글) | 구현·테스트 (OAuth 는 키 대기) |
| users | 마이페이지, 동의 이력, 활동, 탈퇴(익명화) | 구현·테스트 |
| certifications | 검색·분류·상세·관심 | 구현 (검색 E2E) |
| policy | 가격·보상·환불기간·FREE 허용 기능, 버전 발행 | 구현·테스트 |
| challenges | 회차·참여·정원·업/다운그레이드, EntitlementService | 구현·테스트 |
| study | 공부 세션, 학습기록, 대시보드 | 구현·테스트 |
| analytics | PLIT 도전 지표(추정)·회차 비교 순수 함수 | 구현·단위테스트 |
| payments | 주문·승인·웹훅·환불, MOCK/TOSS 어댑터 | 구현·테스트 (TOSS 는 키 대기) |
| points | 포인트 원장·잔액·역분개·정합성 감사 | 구현·테스트 |
| verifications | 증빙 업로드·제출·심사·이의신청 | 구현·테스트 |
| admin | 통계·회원·주문·환불·포인트 조정·정책·회차·감사 로그 | 구현 (주요 경로 테스트) |

## 인증·인가
- access JWT 15분(메모리 보관) + refresh 30일(DB 에 SHA-256 해시, 회전, 재사용 탐지 시 family 폐기)
- 전역 `AuthGuard`: 매 요청 DB 에서 status/role 재확인 → 정지·탈퇴 즉시 반영
- 역할: USER < OPERATOR(심사·커뮤니티) < SUPER_ADMIN(정책·환불·포인트·권한)
- 기능 권한: `EntitlementService.require(userId, enrollmentId, feature)` — PREMIUM 은 패스 ACTIVE·미만료까지 재확인

## 결제 흐름 (토스 표준 흐름과 동일)
1. `POST /payments/orders` — 서버가 정책 금액으로 주문 생성 (PENDING 재사용, 가격 변경 시 만료)
2. 클라이언트 결제위젯 → successUrl 로 paymentKey/orderId/amount 수신
3. `POST /payments/confirm` — 금액 비교 → 결제키 조건부 선점 → (트랜잭션 밖) PG 승인 → (트랜잭션) PAID + 패스 발급 + FREE→PREMIUM 전환
4. 네트워크 오류는 PENDING 유지(같은 키 재시도/웹훅으로 확정), 웹훅은 PG 조회 API 로 재검증
5. 환불: PG 취소 → REFUNDED → 패스 REVOKED → PREMIUM→FREE (보상 스냅샷도 하향)

## 비기능
- 로그: pino JSON, requestId, Authorization/쿠키 마스킹
- 오류: `{code, message, requestId}` 통일, 5xx 상세 비노출
- 요청 제한: 전역 120/분, 로그인 10/분, 가입 5/분, 재설정 3/분
- 보안 헤더: helmet, X-Frame-Options DENY, x-powered-by 제거
