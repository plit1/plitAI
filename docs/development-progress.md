# 개발 진행 기록

> 다음 세션은 이 파일 → `development-roadmap.md` → `decisions.md` 순서로 확인.

## 현재 위치
- 브랜치: `feature/phase3-member-admin` (develop 에서 분기). 이전: `feature/phase0-2-foundation` (develop 에 반영됨)
- GitHub `plit1/plitAI` 에 `develop`, `feature/phase0-2-foundation` push 완료, CI 통과 (API 51/51, web build). 태그 `demo-v2.9-stable` 은 프록시 오류로 push 실패 → 로컬에만 존재 (main@0bf2531 과 동일 커밋)
- 완료 Phase: 0, 1, 2, **3** / 진행: 5 일부(결제·인증·원장 백엔드 선행)

## 세션 2 (2026-11-09) — Phase 3
### 완료
- 관리자 2단계 인증(TOTP): 등록·해제·OTP 로그인·refresh 유지·리플레이 차단·시크릿 암호화·최고관리자 초기화. `ADMIN_MFA_REQUIRED`(운영·스테이징 기본 true)
- 보안 수정: access 토큰 `typ` 클레임 검사 — 같은 키로 서명된 OAuth state·MFA 단계 토큰의 Bearer 사용 차단 (기존 500 → 401)
- 소셜 계정 연결·해제 API + OAuth 콜백 첫 자동 테스트(가짜 provider)
- 오픈런(신규 챌린지 개설 요청): 데모 orRequests 규칙 이관, 공통 텍스트 필터
- 시험 일정: 직접 입력·CSV 일괄 등록(미리보기·전체 거부)·공개 조회
- 화면: 로그인 OTP 단계, 소셜+MFA, 계정 설정(프로필·선택 동의·로그인 연결·MFA·탈퇴), 오픈런, 관리자 8개 화면(대시보드·정책·회차·시험일정·오픈런·회원·결제·감사로그)
- 브라우저 E2E 실행기 `apps/web/e2e/run.sh`: 흐름마다 새 DB 생성(기존 데이터 무변경), API 를 staging 설정으로 검증

### 기능 상태 (세션 2 변경분)
| 기능 | 상태 |
|---|---|
| 관리자 MFA (TOTP) | 개발 및 테스트 완료 (복구 코드는 미구현 — 분실 시 최고관리자 초기화) |
| 계정 연결·해제 | 개발 및 테스트 완료 (가짜 provider) / 실제 카카오·네이버·구글 통신은 외부 연동 대기 |
| 오픈런 요청·관심·심사·회차 연결 | 개발 및 테스트 완료 / 개설 알림 발송은 미구현(대상 수만 집계, 알림 모듈 Phase 7) |
| 시험 일정 직접 입력·CSV | 개발 및 테스트 완료 |
| 큐넷 공공데이터 API 자동 동기화 | 외부 연동 대기 — data.go.kr 가 이 세션 네트워크에서 차단되어 응답 명세를 확인하지 못함. 추측 구현하지 않음 |
| 관리자 화면 8종 | 개발 및 테스트 완료 (브라우저 E2E 는 정책·회차·시험일정·오픈런·감사로그 경로, 회원·결제 화면은 API 테스트만) |
| 계정 설정 화면 | 개발 및 테스트 완료 (선택 동의 E2E), 소셜 연결 버튼은 키 없어 화면 미검증 |
| 모바일 헤더의 오픈런 메뉴 | 미구현 (sm 미만에서 숨김 — 모바일 메뉴 필요) |
| 관리자 회차 목록의 draft/cancelled 표시 | 일부 (공개 목록 API 재사용으로 open/closed 만 조회) |

## 세션 1 (2026-11-09)
### 완료
- PHASE 0 `phase0-assessment.md`, `production-gap-analysis.md`
- PHASE 1 `architecture.md`, `database.md`, `api.md`, `development-roadmap.md`, `decisions.md`
- PHASE 2 모노레포, Prisma 스키마·초기 마이그레이션, NestJS 공통(설정 검증·가드·오류·로그·레이트리밋), Docker/compose, CI, Terraform 스테이징
- 백엔드 모듈: auth, users, certifications, policy, challenges, study, analytics, payments, points, verifications, admin
- 웹: 홈, 자격증찾기, 챌린지 상세, 가입, 로그인(+소셜 콜백), 결제(MOCK), 대시보드(공부 타이머·지표), 마이, 포인트, 합격 인증, 관리자(통계·심사)

### 기능 상태
| 기능 | 상태 |
|---|---|
| 이메일 가입·로그인·로그아웃·refresh·재설정·탈퇴·동의 이력 | 개발 및 테스트 완료 |
| 카카오·네이버·구글 로그인 | 개발 완료 / 외부 연동 대기 (앱 키) — 실제 provider 통신 미검증 |
| 계정 연결(로그인 후 소셜 연결) | 일부 구현 (서비스 메서드만, API·화면 없음) |
| 관리자 MFA | 미구현 (스키마 필드만) |
| 자격증 검색·분류·상세·관심 | 개발 및 테스트 완료 (시드 50종) |
| 시험 일정 공공데이터 동기화 | 미구현 / 외부 연동 대기 (공공데이터포털 키) |
| 챌린지 목록·상세·참여·정원·중복·마감 | 개발 및 테스트 완료 |
| 친구 초대 코드 저장 | 일부 구현 (가입·참여 시 기록만, 보상 미구현) |
| 정책 관리(가격·보상·FREE 기능) | 개발 및 테스트 완료 (API), 관리자 화면 미구현 |
| 부스터 패스 결제 (MOCK PG) | 개발 및 테스트 완료 |
| 토스페이먼츠 연동 | 개발 완료 / 외부 연동 대기 (test_sk 키로 미검증), 웹 결제위젯 미구현 |
| 환불·다운그레이드·웹훅 재검증 | 개발 및 테스트 완료 (MOCK) |
| 학습 세션·학습기록·XP | 개발 및 테스트 완료 |
| PLIT 도전 지표(추정)·회차 비교 | 개발 및 테스트 완료 |
| QUICK TEST·AI 전략·CLEAR MODE·LLM | 미구현 (권한 코드만 존재) |
| 합격 인증·관리자 심사·이의신청 | 개발 및 테스트 완료 (로컬 디스크 저장) |
| 포인트 원장·역분개·관리자 조정 | 개발 및 테스트 완료 |
| 포인트 만료 | 미구현 |
| 포인트 실보상 활성화 | 검증 또는 승인 필요 (법률 검토) — `REWARDS_LIVE=false` |
| 스터디룸·커뮤니티·게이미피케이션 화면·취업·창업·광고·포인트몰 | 미구현 (데모 로직 분석 완료) |
| Docker 이미지 | 개발 완료 / 테스트 미진행 |
| Terraform 스테이징 | 개발 완료 / 테스트 미진행 (plan 미실행), apply 는 승인 필요 |
| CI | 개발 및 테스트 완료 (GitHub Actions 통과) |

## 다음 세션 할 일 (우선순위)
1. `feature/phase3-member-admin` → `develop` 반영 (CI 확인 후)
2. Phase 4: QUICK TEST 문항 은행·채점(서버), AI 학습전략(Claude API — 응답 생성과 지표 계산 분리, 사용량 한도·비용 로그), CLEAR MODE
3. Phase 4: 스터디룸 실시간(socket.io + Redis adapter, 공통 text-filter 재사용, 신고·제재), 커뮤니티(스터디룸 글 자동 노출)
4. 모바일 내비게이션 메뉴, 관리자 회차 전체 상태 조회 API
5. 외부 키 도착 시: 토스 테스트키 결제위젯, 소셜 로그인 실연동, data.go.kr 접근 허용 후 큐넷 어댑터
6. 정리: E2E 가 만든 `plit_e2e_*` DB (자동 삭제 안 함)
