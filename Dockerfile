# syntax=docker/dockerfile:1
# 하나의 Dockerfile에서 api / worker / web / migrate 이미지를 target으로 나눠 빌드합니다.
# 네이티브 바이너리가 없어 amd64, arm64 모두 빌드 가능합니다:
#   docker buildx build --platform linux/amd64,linux/arm64 --target api -t <registry>/erm-api .

FROM node:22-bookworm-slim AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH NEXT_TELEMETRY_DISABLED=1
RUN corepack enable
WORKDIR /app

FROM base AS build
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm build

# DB 마이그레이션과 초기 데이터 (실행 후 종료)
FROM build AS migrate
CMD ["sh", "-c", "pnpm db:deploy && pnpm db:seed"]

FROM build AS api
ENV NODE_ENV=production
EXPOSE 4000
CMD ["node", "apps/api/dist/main.js"]

FROM build AS worker
ENV NODE_ENV=production
CMD ["node", "apps/worker/dist/main.js"]

FROM build AS web
ENV NODE_ENV=production
EXPOSE 3000
WORKDIR /app/apps/web
CMD ["pnpm", "start"]
