FROM node:22-alpine AS web-builder

WORKDIR /app

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH

RUN corepack enable

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.json ./
COPY apps/web/package.json apps/web/package.json
COPY apps/monitor/package.json apps/monitor/package.json
COPY apps/api/package.json apps/api/package.json
COPY packages/shared/package.json packages/shared/package.json

RUN pnpm install --frozen-lockfile

COPY apps/web apps/web
COPY packages/shared packages/shared

ARG VITE_DONATION_URL=
ENV VITE_DONATION_URL=$VITE_DONATION_URL

ARG VITE_CURRENCY_SYMBOL=$
ENV VITE_CURRENCY_SYMBOL=$VITE_CURRENCY_SYMBOL

RUN pnpm --dir apps/web build

FROM caddy:2.11.7-alpine

COPY deploy/Caddyfile /etc/caddy/Caddyfile
COPY deploy/monitor.Caddyfile /etc/caddy/monitor.Caddyfile
COPY --from=web-builder /app/apps/web/dist /srv

COPY LICENSE /usr/share/licenses/kado/LICENSE
