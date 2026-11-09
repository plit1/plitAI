# CLAUDE.md — PLIT 정식 서비스 개발 규칙

## 세션 시작 시 반드시
1. `docs/development-progress.md` 를 먼저 읽고 마지막 상태·다음 작업을 확인한다.
2. `git status`, `git log --oneline -10`, 현재 브랜치 확인. `main` 에 직접 커밋 금지.
3. 이미 완료된 항목은 다시 만들지 않는다. 결정 사항은 `docs/decisions.md` 를 따른다.

## 저장소 구조
- `index.html` — **데모 v2.9 원본 번들 (수정·삭제 금지)**. 시각 기준 자료. 태그 `demo-v2.9-stable`.
- `apps/api` — NestJS 11 + Prisma 6 + PostgreSQL 16 (모듈형 모놀리스)
- `apps/web` — Next.js 15 App Router + Tailwind (데모 디자인 토큰)
- `infra/terraform/staging` — AWS 서울 스테이징 IaC (apply 는 승인 필요)
- `docs/` — 요구사항·설계·진행 기록

## 브랜치
`main`(데모 안정본) ← `develop`(정식 개발 통합) ← `feature/*`

## 로컬 실행
```
service postgresql start            # 또는 docker compose up -d postgres redis
cd apps/api && cp .env.example .env && npx prisma migrate dev && pnpm seed && pnpm start:dev   # 시드: src/seed/seed.ts (빌드 후 dist/seed/seed.js)
cd apps/web && pnpm dev             # http://localhost:3000 (/api 는 :4000 으로 프록시)
```
테스트: `cd apps/api && pnpm test` (plit_test DB 필요, 이름에 test 없으면 실행 거부) /
브라우저 E2E: `apps/web/e2e/run.sh` (흐름마다 새 DB 생성 — DB 리셋 금지)

## 절대 규칙
- 금액·포인트는 정수. 결제 금액은 **서버 정책값**으로만 계산, 클라이언트 값은 비교용.
- 포인트/XP 원장은 append-only. 수정 대신 REVERSAL. 모든 지급에 `dedupeKey`.
- 경제적 가치 변경(포인트 지급, 환불, 정책)은 같은 트랜잭션에서 `AuditService.log`.
- 권한은 서버에서 검사 (`EntitlementService.require`, `@Roles`). 기본은 로그인 필수, 공개는 `@Public()`.
- `REWARDS_LIVE=false`, `PAYMENT_PROVIDER=MOCK|TOSS(test 키)` 유지. 실결제·실보상·AWS apply·운영 배포는 **사용자 승인 후**.
- "합격 확률"이라고 표시하지 않는다. "PLIT 도전 지표 (추정)" + 면책 문구.
- 테스트하지 않은 것을 완료로 기록하지 않는다. 진행 기록에 상태 구분(개발 및 테스트 완료 / 테스트 미진행 / 일부 / 미구현 / 외부 연동 대기 / 승인 필요).
- DB 변경은 `prisma migrate dev --name <설명>` 마이그레이션으로만.
