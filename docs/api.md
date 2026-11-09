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

## Phase 4 추가 (세션 3)
| 메서드 | 경로 | 권한 | 설명 |
|---|---|---|---|
| POST | /enrollments/:id/quiz | 부스터 | 응시 생성(미제출 응시 재사용), 정답 비노출. 400 EXAM_FINISHED, 404 NO_QUIZ_ITEMS |
| GET | /quiz-attempts/:id · POST /quiz-attempts/:id/submit `{answers}` | 본인 | 제출 1회. 400 UNANSWERED(details.missing) / INVALID_ANSWER, 409 ALREADY_SUBMITTED |
| GET | /enrollments/:id/quiz/history | 본인 | |
| GET/POST/PATCH | /admin/quiz-items | OPERATOR | 과목·정답 범위 검증, 출처 없는 공개 금지 |
| GET | /enrollments/:id/strategy | 부스터 | 주간 부족분·미션 미리보기·남은 페이스·CLEAR MODE |
| POST | /enrollments/:id/strategy/apply · /clear-mode | 부스터 | 같은 부족분 재적용 무변경 / D-7 이하만 |
| POST | /enrollments/:id/coach | 부스터 | `{message, source: AI|RULES, reason?, remainingToday}` |
| GET | /admin/ai-usage?days | OPERATOR | 모델별 호출·토큰·비용 |
| GET | /community/posts?category&q&certId&sort&cursor · /community/posts/:id | 공개 | 신고·차단 대상 제외, 조회수 1인 1일 1회 |
| POST/DELETE | /community/posts(/:id) · /community/posts/:id/comments · /community/comments/:id | 회원 | 텍스트 필터, 1분 3개 |
| PUT/DELETE | /community/posts/:id/like | 회원 | |
| POST | /reports `{targetType: POST|COMMENT|CHAT, targetId, reason}` | 회원 | 409 ALREADY_REPORTED |
| GET/PUT/DELETE | /me/blocks(/:userId) | 회원 | |
| GET | /admin/reports?status · POST /admin/reports/:id/moderate `{action: hide|restore|dismiss}` | OPERATOR | 감사 로그 |
| GET | /study-rooms/:id · /messages?before · /posts | 참여자·운영자 | 상태 ACTIVE/READ_ONLY/ARCHIVED |
| POST | /study-rooms/:id/messages · /posts `{category,title,body,ack?}` | 참여자 | 428 NOTICE_REQUIRED, 403 ROOM_CLOSED, 429 RATE/BURST/COOLDOWN |
| PATCH | /admin/study-rooms/:id `{closeAt?, autoShare?}` | OPERATOR | |
| POST | /admin/study-rooms/purge | SUPER_ADMIN | 보관 대상 채팅 삭제(신고분 보존). 서버가 10분마다도 실행 |

### WebSocket `/study-room` (socket.io)
- 연결: `io(API_ORIGIN + '/study-room', { auth: { token: accessToken } })` — 인증 실패 시 `connect_error: UNAUTHORIZED`
- `join {roomId}` → ack `{ok, data:{summary, messages}}` / `send {roomId, body}` → ack `{ok, data|code,message}` / 서버 → `message`

## Phase 5 추가 (세션 4)
| 메서드 | 경로 | 권한 | 설명 |
|---|---|---|---|
| GET | /me/points/expiring | 회원 | 30일 내 만료 예정 로트·합계 |
| POST | /admin/points/expire | SUPER_ADMIN | 만료 배치 수동 실행 (1시간 주기 자동) |
| GET | /admin/verifications/:id/evidence | OPERATOR | 증빙 원본 (no-store·nosniff·CSP sandbox), 열람 감사 로그 |
| POST | /enrollments/:id/verification `{…, examRoundId?}` | 본인 | 400 INVALID_EXAM_ROUND |
| GET | /admin/settlement/revenue?from&to&by=day|month&includeTest | OPERATOR | 결제·환불·순매출·공급가·부가세 |
| GET | /admin/settlement/revenue.csv | OPERATOR | CSV 첨부 |
| GET | /admin/settlement/points?from&to&by | OPERATOR | 유형별 집계, 미사용 잔액·실제 가치 포인트 |
| POST | /admin/settlement/reconcile | SUPER_ADMIN | 결제 대사 (15분 주기 자동) |

### 토스 결제위젯 흐름 (웹)
`POST /payments/orders` → `loadTossPayments(clientKey)` → `widgets({customerKey})` → `setAmount({currency:'KRW', value})` → `renderPaymentMethods/renderAgreement` → `requestPayment({orderId, orderName, successUrl, failUrl})`
→ successUrl `?paymentType&amount&orderId&paymentKey` → `POST /payments/confirm` (서버가 금액 재검증) / failUrl `?code&message&orderId`
