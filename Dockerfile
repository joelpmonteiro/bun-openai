FROM oven/bun:1.3.14-slim AS base
WORKDIR /app

FROM base AS deps
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production

FROM base
COPY --from=deps /app/node_modules ./node_modules
COPY . .

ENV NODE_ENV=production
ENV HOST=76.13.174.167
ENV PORT=4500
EXPOSE 4500

CMD ["bun", "run", "index.ts"]
