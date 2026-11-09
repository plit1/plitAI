# 데이터베이스 설계

스키마 원본: `apps/api/prisma/schema.prisma` · 마이그레이션: `apps/api/prisma/migrations/`

## ERD (요약)
```
User 1─* AuthIdentity          (provider, providerUserId) UNIQUE → 소셜 중복 가입 방지
User 1─* RefreshToken          tokenHash UNIQUE, familyId
User 1─* UserConsent           이력형 (철회도 새 행)
User 1─* FavoriteCertification *─1 Certification 1─* ChallengeOffering
                                                  1─* ExamRound
User 1─* Enrollment *─1 ChallengeOffering        (userId, offeringId) UNIQUE
Enrollment 1─1 StudyRecord · 1─1 PassVerification · 0..1─1 BoosterPass · 1─* EnrollmentPlanChange
User 1─* StudySession (enrollmentId)
User 1─* Order 1─* PaymentEvent (eventKey UNIQUE) · Order 0..1─1 BoosterPass
User 1─* PointLedgerEntry (dedupeKey UNIQUE, reversesId UNIQUE) · User 1─1 PointAccount(잔액 캐시)
User 1─* XpLedgerEntry (eventKey UNIQUE)  ← 포인트와 분리
User 1─* AdminAuditLog (actor) · PolicyVersion(isCurrent) · AiUsageLog
```

## 정합성 규칙
| 대상 | 방식 |
|---|---|
| 정원 | `UPDATE ... SET joined = joined+1 WHERE joined < cap` (영향 0행 → 마감) |
| 중복 참여 | `Enrollment(userId, offeringId)` UNIQUE |
| 포인트 동시성 | `PointAccount` 행 `SELECT ... FOR UPDATE` 후 원장 INSERT + 잔액 UPDATE |
| 포인트 멱등 | `dedupeKey` UNIQUE (`welcome:`, `reward:{enrollmentId}`, `fail:`, `adjust:`, `reverse:`, `exchange:`) |
| 결제 멱등 | `Order.paymentKey` UNIQUE + 조건부 선점, `PaymentEvent.eventKey` UNIQUE |
| 보상 소급 금지 | `Enrollment.rewardSnapshot`, `policyVersion` |
| 심사 경합 | `PassVerification` 행 `FOR UPDATE` + 상태 REVIEWING 확인 |

## 개인정보
- 수험번호: 뒤 4자리만 저장 · 증빙: 비공개 저장소 키만 저장
- 탈퇴: email/password/nickname/MFA 익명화, 소셜 연결·관심 삭제. 결제·포인트 원장은 법정 보존(전자상거래법 5년) 후 파기 배치(미구현)
- 테스트 계정: `User.isTest`, 테스트 주문: `Order.isTest`, 가상 포인트: `PointLedgerEntry.isVirtual`

## Phase 3 추가
- `User.mfaSecret`(암호문) · `mfaEnabledAt` · `mfaLastStep`(리플레이 차단) / `RefreshToken.mfa`
- `OpenRunRequest`(certificationKey UNIQUE = 정규화 이름, interestCount 캐시) · `OpenRunInterest`(requestId, userId) PK
- 마이그레이션: `20261109125104_phase3_mfa_open_requests`(초안 테이블 포함) → `20261109125519_open_run_requests`(초안 제거·오픈런 모델로 교체, 미배포 상태에서 교체)

## Phase 4 추가
- `QuizItem`(certId·subject·answer·source·isSample·status) · `QuizAttempt`(itemIds 고정·answers·submittedAt 조건부 갱신)
- `StudyRecord.appliedPlan`
- `CommunityPost`(origin COMMUNITY/STUDY_ROOM, roomId, isPublic, 카운터 캐시) · `CommunityComment` · `PostLike`(PK) · `PostView`(postId,userId,day PK)
- `ContentReport`(reporterId,targetType,targetId UNIQUE) · `UserBlock`
- `StudyRoom`(=offeringId, closeAt, purgedAt, autoShare) · `ChatMessage` · `ChatHold`(messageId UNIQUE, holdUntil) · `NoticeAck`(userId,version)
- 마이그레이션 `20261109133517_phase4_quiz_community_studyroom`

## Phase 5 추가
- `Order.refundedAt` (정산: 환불일 기준), `PointLedgerEntry.expiresAt` 사용 시작 (EARN 자동 설정), EXPIRE 항목 `refType=POINT_ENTRY, refId=로트, dedupeKey=expire:{로트}`
- `PassVerification.examRoundId` 사용 시작
- 마이그레이션 `20261109142022_order_refunded_at`

## Phase 6 추가
- `Pet`(userId PK, species, name, selectedCostumeId) · `PetEvolution`(userId+level UNIQUE, trigger) — XP 는 기존 `XpLedgerEntry`(eventKey 멱등)에서 합산
- `UserCertClaim`(본인 입력 자격증)
- `JobPosting`(provider+providerJobId UNIQUE, region, requiredCerts/preferredCerts/categories 배열, status ACTIVE/ARCHIVED, isDemo, originalUrl, fetchedAt) · `CertJobMap`(관리자 키워드) · `JobProfile` · `SavedJob`
- `StartupProgram`(provider+externalId UNIQUE, region/sigungu, targetStages/industries 배열, supportType, applyStart/End, status ACTIVE/HIDDEN, isDemo) · `CertIndustryMap` · `StartupProfile`(roadmap JSON) · `SavedProgram`
- 시드: 데모 공고 24·지원사업 13 (NODE_ENV≠production 이고 SEED_DEMO_CONTENT≠false 일 때만)
- 마이그레이션 `20261109143847_phase6_gamification_jobs_startup`

## 이후 추가 예정 테이블 (Phase 7)
Referral, AdCampaign/AdEvent, MallProduct/MallOrder/Coupon, Notification
