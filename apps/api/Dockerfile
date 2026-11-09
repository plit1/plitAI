# syntax=docker/dockerfile:1.7
# 빌드 컨텍스트: 저장소 루트 (docker build -f apps/api/Dockerfile .)
FROM node:22-bookworm-slim AS base
RUN corepack enable && apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /repo

FROM base AS build
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/api/package.json apps/api/
RUN pnpm install --frozen-lockfile --filter @plit/api...
COPY apps/api apps/api
RUN pnpm --filter @plit/api exec prisma generate && pnpm --filter @plit/api build
RUN pnpm deploy --filter @plit/api --prod --legacy /out && cp -r apps/api/dist apps/api/prisma /out/ \
 && cd /out && npx prisma@6 generate --schema prisma/schema.prisma

FROM node:22-bookworm-slim AS runtime
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates tini && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production PORT=4000
WORKDIR /app
COPY --from=build --chown=node:node /out /app
USER node
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s CMD node -e "fetch('http://127.0.0.1:4000/api/v1/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
ENTRYPOINT ["/usr/bin/tini", "--"]
# 마이그레이션은 배포 파이프라인의 별도 태스크(prisma migrate deploy)로 실행 — 컨테이너 기동과 분리
CMD ["node", "dist/main.js"]
