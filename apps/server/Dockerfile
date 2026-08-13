FROM node:22-alpine

RUN corepack enable

WORKDIR /app

COPY . .

RUN pnpm install --frozen-lockfile=false

RUN pnpm --filter @unintended/shared build \
 && pnpm --filter @unintended/world-data build \
 && pnpm --filter @unintended/game-core build \
 && pnpm --filter @unintended/server build

CMD ["pnpm", "--filter", "@unintended/server", "start"]
