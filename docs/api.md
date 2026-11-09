# API 명세 (v1)

기본 경로 `/api/v1` · 인증 `Authorization: Bearer <access>` · Swagger: 개발/스테이징 `GET /api/docs`
오류 형식: `{ "code": "CAPACITY_FULL", "message": "플릿런 정원이 마감됐어요.", "requestId": "..." }`

| 메서드 | 경로 | 권한 | 설명 |
|---|---|---|---|
| GET | /health | 공개 | DB 포함 헬스체크 |
| POST | /auth/signup | 공개 | 이메일 가입 (consents 필수: TERMS, PRIVACY, AGE_14) |
| POST | /auth/login | 공개 | 로그인 → accessToken + refresh 쿠키 |
| POST | /auth/refresh | 쿠키 | 토큰 회전 |
| POST | /auth/logout | 쿠키 | refresh 폐기 |
| POST | /auth/password-reset/request · /confirm | 공개 | 재설정 (30분, 1회용) |
| GET | /auth/providers | 공개 | 활성 소셜 로그인 목록 |
| GET | /auth/oauth/:provider/start · /callback | 공개 | kakao·naver·google |
| GET/PATCH/DELETE | /me | 회원 | 프로필 / 수정 / 탈퇴(`{"confirm":"탈퇴합니다"}`) |
| GET/POST | /me/consents | 회원 | 동의 상태 / 선택 동의 변경 |
| GET | /me/activity · /me/favorites · /me/enrollments | 회원 | |
| GET | /me/points · /me/points/history | 회원 | 잔액 / 원장 (cursor) |
| GET | /policy/plans | 공개 | 플릿런·부스터 패스 가격·보상 |
| GET | /certifications?q&field&group&sort | 공개 | group: NATIONAL_TECH · NATIONAL_PRO · PRIVATE · LANGUAGE |
| GET | /certifications/meta · /certifications/:id | 공개 | |
| PUT/DELETE | /certifications/:id/favorite | 회원 | |
| GET | /challenges?certId&field&status · /challenges/:id | 공개 | |
| POST | /challenges/:id/join `{plan, referralCode?}` | 회원 | 409 ALREADY_JOINED / CAPACITY_FULL, 402 PASS_REQUIRED |
| GET | /enrollments/:id/dashboard | 본인 | 학습기록 + 도전 지표 + 비교 |
| POST | /enrollments/:id/sessions | 본인 | 공부 시작 |
| POST | /sessions/:id/pause · resume · complete · cancel | 본인 | |
| POST | /payments/orders `{offeringId}` | 회원 | 409 DUPLICATE_PASS |
| POST | /payments/confirm `{orderNo, paymentKey, amount}` | 회원 | 400 AMOUNT_MISMATCH, 402 PAYMENT_FAILED, 503 PG_UNAVAILABLE |
| POST | /payments/orders/:orderNo/refund | 회원 | 결제 후 정책 refundDays 이내 |
| GET | /payments/me/orders · /payments/me/passes | 회원 | |
| POST | /payments/webhooks/toss | 공개 | PG 조회로 재검증 |
| POST | /uploads/evidence (multipart `file`) | 회원 | JPG/PNG/PDF 매직바이트, 10MB |
| GET/POST | /enrollments/:id/verification | 본인 | 시험일 이후 제출 |
| POST | /enrollments/:id/verification/appeal | 본인 | 이의신청 |
| GET | /admin/verifications?status | OPERATOR | 심사 큐 |
| POST | /admin/verifications/:id/review `{decision, note?}` | OPERATOR | APPROVE·NEEDS_FIX·FAIL·REJECT |
| GET | /admin/stats · /admin/users · /admin/orders · /admin/audit-logs · /admin/policy | OPERATOR | |
| PATCH | /admin/users/:id/status | OPERATOR | 관리자 계정 제재는 SUPER_ADMIN |
| PATCH | /admin/users/:id/role | SUPER_ADMIN | |
| POST | /admin/orders/:orderNo/refund | SUPER_ADMIN | 감사 로그 |
| POST | /admin/users/:id/points `{amount, reason, idempotencyKey}` | SUPER_ADMIN | 감사 로그 |
| GET | /admin/users/:id/points/audit | OPERATOR | 캐시=원장 합계 검사 |
| POST | /admin/policy `{version, values}` | SUPER_ADMIN | 새 정책 버전 발행 |
| POST/PATCH | /admin/offerings(/:id) | OPERATOR | 회차 개설·변경 |

## Phase 3 추가 (세션 2)
| 메서드 | 경로 | 권한 | 설명 |
|---|---|---|---|
| POST | /auth/login | 공개 | MFA 사용자는 `{mfaRequired:true, mfaToken}` (5분) 반환, 토큰 미발급 |
| POST | /auth/login/mfa `{mfaToken, code}` | 공개 | OTP 확인 후 토큰 발급 (세션에 mfa=true) |
| GET | /auth/mfa | 회원 | MFA 상태 |
| POST | /auth/mfa/enroll · /confirm `{code}` · /disable `{code}` | 회원 | 등록 시작(시크릿·otpauth URL) / 활성화 / 해제(모든 세션 폐기) |
| GET | /me/identities | 회원 | 연결된 로그인 수단 |
| POST | /me/identities/:provider/link | 회원 | `{url}` 반환 → 이동, 콜백 후 `/my/account?linked=` |
| DELETE | /me/identities/:provider | 회원 | 이메일·마지막 수단 해제 불가 |
| POST | /admin/users/:id/mfa/reset `{reason}` | SUPER_ADMIN | 본인 불가, 감사 로그 |
| GET | /open-run?status&sort&q · /open-run/:id | 공개 | 검토 대기·반려는 비공개(요청자 본인만) |
| POST | /open-run `{title, category, round?, reason?}` | 회원 | 409 CERT_EXISTS(details.certId) / 병합 시 merged=true / 429 DAILY_LIMIT |
| PUT/DELETE | /open-run/:id/interest | 회원 | 모집 단계에서만 |
| GET | /me/open-run | 회원 | 내 요청·관심 |
| GET | /admin/open-run?status · POST /admin/open-run/:id/review `{action, note?, offeringId?}` | OPERATOR | APPROVE·START_REVIEW·REJECT·OPEN |
| GET | /certifications/:id/exam-rounds | 공개 | 공식 시험 일정 |
| GET/POST | /admin/exam-rounds · DELETE /admin/exam-rounds/:id | OPERATOR | 직접 입력(같은 회차명은 수정) |
| POST | /admin/exam-rounds/import `{csv, dryRun=true}` | OPERATOR | 헤더 certId,label,applyStart,applyEnd,examDate,resultDate |
| GET | /admin/exam-rounds/providers | OPERATOR | 출처별 연동 상태 |

관리자 API(@Roles OPERATOR 이상)는 `ADMIN_MFA_REQUIRED=true` 일 때 MFA 세션이 아니면 `403 MFA_REQUIRED`.
