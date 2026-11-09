# PHASE 0 — 기존 데모 분석 보고서

- 작성일: 2026-11-09
- 분석 대상: `github.com/plit1/plitai` `main` @ `0bf2531` ("PLIT 자격증 챌린지 데모 v2.9 추가")
- 보존 조치: 해당 커밋에 태그 `demo-v2.9-stable` 생성, 정식 개발은 `develop` → `feature/*` 브랜치에서 진행

## 1. 저장소 상태

| 항목 | 결과 |
|---|---|
| 커밋 수 | 1개 (초기 업로드) |
| 브랜치 | `main` 하나 |
| 파일 | `README.md`, `index.html`(3.9MB) 두 개 |
| 원본 소스(.jsx/.ts) | **없음** — README에도 "원본 컴포넌트 소스는 포함되어 있지 않습니다"라고 명시 |
| 빌드 방식 | React + Vite 빌드 결과를 단일 HTML로 인라인(`vite-plugin-singlefile` 계열). 이미지 50개는 WebP base64로 내장 |
| 배포 | GitHub Pages(main/root) 또는 정적 호스팅 전제 |
| 두 번째 저장소 | 계정에 `plitAI/plitAI`(private)도 존재. 이번 세션은 접근 권한이 없어 확인하지 못함 → **원본 소스가 그 저장소에 있을 가능성 확인 필요** |

## 2. 기술 스택 (번들 역분석)

| 영역 | 사용 기술 | 근거 |
|---|---|---|
| UI | React 18 (production build) | `react.production.min.js` 라이선스 헤더 |
| 라우팅 | React Router (45개 경로) | `path:"..."` 정의 |
| 상태관리 | zustand + persist 미들웨어 | `name:"plit-demo-store"`, schema `vN=6` |
| 저장소 | 브라우저 `localStorage`(+일부 `sessionStorage`) | `storage` 이벤트로 탭 간 동기화 |
| 스타일 | Tailwind CSS (커스텀 토큰 `cobalt`, `clear`, `night`, `ink-*`) | className 문자열 |
| 애니메이션 | framer-motion | spring 설정 코드 |
| 폰트 | Archivo, IBM Plex Sans KR, Noto Sans KR (Google Fonts) | `<link>` |
| 백엔드 | **없음** | `fetch()` 호출은 Vite modulepreload 폴리필 1건뿐 |
| 외부 API | **실제 호출 없음** — 고용24·사람인·K-Startup·상권정보 등은 "프록시 미설정" 상태로 거절하는 Provider 스텁 | `PROXY_MISSING`, `PARTNERSHIP_REQUIRED` |
| 인증 | **없음** — 사용자 `"me"`/작성자 `"김플릿"` 고정 | |
| 결제 | `MOCK_PG` 모의 결제(브라우저 내부 상태 전이) | `kind:"MOCK_PG"` |

## 3. 화면/라우트 목록 (45개)

| 영역 | 경로 |
|---|---|
| 홈·소개 | `/`, `/about`, `/demo` |
| 자격증찾기 | `/finder` |
| 챌린지 | `/challenges/:id`, `/challenges/:id/join`, `/open-run`, `/open-run/:id`, `/my-challenges` |
| 대시보드·CLEAR | `/dashboard/:recordId`, `/clear-management/:recordId` + `/study`, `/test`, `/analysis`, `/strategy`, `/exam-info` |
| AI 부스터 | `/ai`, `/ai/pass/:offeringId` |
| 스터디룸 | `/study-room/:offeringId` |
| 합격 인증 | `/verify/:recordId` |
| 커뮤니티 | `/community`, `/community/:id` |
| 마이 | `/my`, `/my/passes`, `/my/points` |
| 포인트몰 | `/mall`, `/mall/coupons` |
| 친구초대 | `/referral`, `/invite/:code` |
| 광고 | `/ads/:campaignId` |
| 취업하기 | `/jobs`, `/jobs/:jobId`, `/jobs/cert/:certId`, `/jobs/saved`, `/jobs/settings`, `/jobs/admin` |
| 창업하기 | `/startup`, `/startup/roadmap`, `/startup/programs`, `/startup/programs/:programId`, `/startup/funds`, `/startup/market`, `/startup/partners`, `/startup/admin` |

## 4. 데모에 구현된 도메인 로직 (서버 이관 대상)

데모는 "서버가 없는 프런트엔드"임을 스스로 밝히고 있으며, 코드 주석에 *"실서비스에서는 이 모듈을 서버/DB 집계 서비스로 옮긴다"*고 적혀 있다. 즉, 비즈니스 규칙은 이미 상당히 정교하게 설계되어 있고 **정식 버전의 과제는 이 규칙을 서버로 옮겨 강제하는 것**이다.

| 도메인 | 데모 구현 내용 | 서버 이관 시 유지할 규칙 |
|---|---|---|
| 자격증 | 50종 시드(`X5`): id·이름·분야(9개)·자격유형(국가기술/국가전문/국가자격/국가공인 민간/민간/어학)·챌린지유형(exam/edu_exam/completion/score)·시행기관·난이도·태그라인·합격기준·과목 | 그대로 DB 시드로 이관 (`apps/api/prisma/seed-data/certifications.json`) |
| 챌린지 회차(Offering) | 자격증당 회차(`{certId}-2027-1`), 모집마감·시험일·기간, FREE/PREMIUM 각 정원 300, 상태 open/closed | 정원·마감·중복참여 검사를 트랜잭션으로 |
| 참여(Enrollment) | 마감/중복/정원/PREMIUM은 유효 패스 필수(`PASS_REQUIRED`), `rewardSnapshot`·`policyVersion` 기록(정책 소급 없음) | 동일 |
| 상품/정책 | FREE=플릿런(0원, 합격보상 2,000P), PREMIUM=플릿 부스터 패스(29,000원 VAT포함, 시험 회차당 1회, 보상 20,000P), 재도전 비활성, 환불 7일 | `policy` 테이블에서 관리자 변경 가능 |
| 기능 권한 | FREE 허용: `TODAY_STUDY`, `BASIC_PROBABILITY` / 나머지(QUICK_TEST, CLEAR_MODE, AI 전략 등)는 PREMIUM | 백엔드 `EntitlementGuard`로 강제 |
| 결제 | 주문 생성 → PENDING 재사용 → PG 이벤트 멱등 처리(`bpEvents`) → 성공 시 패스 발급, 동일 회차 유효 패스 존재 시 자동 환불, 가격 변경 시 미승인 주문 만료, 환불 시 PREMIUM→FREE 다운그레이드 | Toss Payments 서버 승인 + 금액 검증 + 멱등키 |
| 학습 세션 | 시작/일시정지/재개/완료, 최소 60초, 세션 ID 기반 중복 반영 방지(`processedKeys`) | `study_session` + 유니크 키 |
| 지표 엔진 `PLIT_AN` | 비교 모집단 = 자격증+회차+챌린지, 이상 세션 제외(1회 600분/1일 960분 상한), 표본 10명 미만 비교 비공개, "PLIT 도전 지표(추정)" 가중치 study .30/trend .10/quiz .25/progress .25/time .10, 5~95 클램프, 결측 시 재정규화, 면책 문구 | 순수 함수로 서버 이관 (`analytics/challenge-index.ts`) |
| QUICK TEST | 20문항, 정답률→예상점수(×0.9), 과목별 정확도, 과락(40 미만) 위험 | 문항 은행 서버화 (Phase 4) |
| 합격 인증 | 시험일 이후 제출 → reviewing → approved/needs_fix/failed, 보상은 `reward:{enrollmentId}` dedupeKey로 1회만 | 증빙 업로드 + 관리자 심사 |
| 포인트 원장 | append-only 배열, 잔액=합계, `dedupeKey` 중복 방지, 가입축하 3,500P, 교환 시 잔액 검사 | `point_ledger` 테이블 + 유니크 `dedupe_key` |
| 게이미피케이션 | 펫 5단계(XP 0/100/300/650/1100), 학습 XP(10 + 10분당 5, 최대 60), 테스트 30, 7일 연속 80, 합격 150, 컨디션(24/48/72h), WIN 상위 10%·최소 표본 10 | XP는 포인트와 별도 원장 |
| 스터디룸 | 참여자만 읽기/쓰기, 금칙어·URL·연락처·내부 진단 링크 차단, 신고·차단·모더레이션 | WebSocket + 서버 필터 |
| 커뮤니티 | 게시글·댓글·좋아요·조회수(세션당 1회)·신고 | REST |
| 광고 | 4개 카드마다 광고 1개, CPA 단가, 승인/반려, 시뮬레이션 | Phase 7 |
| 포인트몰 | 상품 10종(5,000~50,000P), 데모 쿠폰 코드 발급 | 테스트 공급사 인터페이스 |
| 친구초대 | 추천 코드, 참여 확정 시 보상 | Phase 7 |
| 취업 | 고용24(work24) Provider 정의 + 관리자 키 설정 화면, 사람인은 제휴 필요로 차단 | 서버 프록시 |
| 창업 | K-Startup, 소상공인 상가정보, 소상공인365, 부동산원, 지역신용보증재단 17곳 링크 | 서버 프록시 |

## 5. 기능별 실제 작동 여부

| 구분 | 상태 |
|---|---|
| 화면·UX·카피 | 데모 내에서 작동 (브라우저 단독) |
| 회원가입/로그인/소셜로그인 | 미구현 |
| 데이터 영속성 | 브라우저 localStorage만 — 기기·사용자 간 공유 불가 |
| 권한 검사 | 클라이언트에서만 (우회 가능) |
| 결제 | 모의 결제만 |
| 외부 공공 API | 미연동 (Provider 스텁) |
| 실시간 채팅 | 같은 브라우저 탭 간 동기화만 |
| 관리자 | 데모 화면(`/jobs/admin`, `/startup/admin`, `/demo`) 수준 |

## 6. 재사용 판단

| 자산 | 재사용 방식 |
|---|---|
| 도메인 규칙·정책 수치·문구 | **그대로 서버로 이관** (본 세션에서 시작) |
| 자격증 50종 시드, 포인트몰 상품, 커뮤니티 시드 | JSON 추출 → DB 시드 |
| UI 디자인(토큰·컴포넌트·카피) | 번들에서 토큰 추출 → Next.js에서 재구현. 원본 소스가 없으므로 **직접 수정·재빌드는 불가** |
| `index.html` 데모 자체 | 저장소 루트에 그대로 보존 (GitHub Pages 유지, 시각적 기준) |

## 7. 위험사항

| # | 위험 | 영향 | 대응 |
|---|---|---|---|
| R1 | 프런트엔드 원본 소스 부재 | UI를 재구현해야 함 (가장 큰 공수) | `plitAI/plitAI` private 저장소 확인 요청. 없으면 Next.js로 화면 단위 재구현 |
| R2 | 이번 세션은 GitHub push 권한이 없음 | 변경 이력이 로컬에만 존재 | 사용자 승인으로 저장소 push 권한 연결 필요 |
| R3 | 경제적 보상(현금성 포인트) 법률 검토 미완 | 상용 활성화 불가 | `REWARDS_LIVE=false` 기본값, 가상 포인트로만 동작 |
| R4 | 공식 개인 합격조회 API 미확인 | 자동 검증 불가 | 증빙 업로드 + 관리자 심사 구조 |
| R5 | 초기 데이터 부족 시 "합격 확률" 오인 | 표시·광고 리스크 | 데모와 동일하게 "추정 지표" 명칭·면책 문구·표본 최소치 유지 |
| R6 | 단일 번들 4MB | 초기 로딩 성능 | Next.js 라우트 분할·이미지 최적화 |
