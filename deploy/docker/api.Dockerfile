FROM node:22-alpine AS builder
WORKDIR /app
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/shared/package.json packages/shared/package.json
RUN pnpm install --frozen-lockfile
COPY apps/api/src apps/api/src
COPY apps/api/scripts apps/api/scripts
COPY apps/api/migrations apps/api/migrations
COPY apps/api/tsconfig.json apps/api/tsconfig.json
COPY packages/shared/src packages/shared/src
RUN pnpm --dir apps/api build && pnpm --filter @kado/api deploy --legacy --prod /out
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder --chown=node:node /out/node_modules ./node_modules
COPY --from=builder --chown=node:node /app/apps/api/dist ./dist
USER node
EXPOSE 3000
CMD ["node","dist/server.cjs"]
