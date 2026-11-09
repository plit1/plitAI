# PLIT 플릿 · 자격증 취득부터 취업까지

주식회사 플릿랩스 PLIT 정식 서비스 모노레포.

| 경로 | 내용 |
|---|---|
| `index.html` | 데모 v2.9 (단일 HTML 빌드 결과물, 브라우저로 바로 실행 · GitHub Pages) — **보존 대상** |
| `apps/api` | 백엔드 API — NestJS · Prisma · PostgreSQL |
| `apps/web` | 웹 — Next.js · Tailwind |
| `infra/terraform` | AWS 인프라 코드 |
| `docs/` | 분석·설계·진행 기록 (`development-progress.md` 부터) |

## 빠른 시작
```bash
pnpm install
docker compose up -d postgres redis
cd apps/api && cp .env.example .env && npx prisma migrate dev && pnpm seed && pnpm start:dev
# 다른 터미널
cd apps/web && pnpm dev   # http://localhost:3000
```
개발용 관리자: `admin@plit.local` / `PlitAdmin123!` (시드, 개발 DB 전용)

테스트: `cd apps/api && pnpm test` · API 문서: http://localhost:4000/api/docs
