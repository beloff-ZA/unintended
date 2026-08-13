FROM node:22-alpine AS build
RUN corepack enable
WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile=false && pnpm --filter @unintended/web build
FROM nginx:alpine
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
