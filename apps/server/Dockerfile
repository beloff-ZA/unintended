FROM node:22-alpine AS build
RUN corepack enable
WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile=false && pnpm --filter @unintended/server build
CMD ["pnpm","--filter","@unintended/server","start"]
