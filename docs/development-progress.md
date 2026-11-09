# 개발 진행 기록

> 다음 세션은 이 파일 → `development-roadmap.md` → `decisions.md` 순서로 확인.

## 현재 위치
- 브랜치: `feature/phase0-2-foundation` (develop 에서 분기), 기준 태그 `demo-v2.9-stable`
- GitHub `plit1/plitAI` 에 `develop`, `feature/phase0-2-foundation` push 완료, CI 통과 (API 51/51, web build). 태그 `demo-v2.9-stable` 은 프록시 오류로 push 실패 → 로컬에만 존재 (main@0bf2531 과 동일 커밋)
- 완료 Phase: 0 (분석), 1 (설계 문서), 2 (기반) / 진행: 3 일부, 5 일부(결제·인증·원장 백엔드 선행)

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
1. 태그 `demo-v2.9-stable` push 재시도, `develop` → `main` PR 여부 결정
2. `plitAI/plitAI`(private)에 데모 원본 소스(.jsx)가 있는지 확인 — 있으면 웹 재구현 전략 변경 (decisions D-002)
3. Phase 3 마무리: 관리자 정책·회차 화면, 계정 연결 API, 관리자 MFA(TOTP), 챌린지 개설 요청
4. Phase 4: QUICK TEST 문항 은행, 스터디룸(socket.io + Redis), 커뮤니티, AI 전략(Claude API, 사용량 제한·비용 로그)
5. 토스 테스트 키 받으면 `PAYMENT_PROVIDER=TOSS` 로 결제위젯 연동·실 테스트
