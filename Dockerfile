FROM oven/bun:1.3.14-alpine AS builder

RUN apk add --no-cache openssl
WORKDIR /app

COPY package.json bun.lock ./
COPY extensions/customer-support/package.json extensions/customer-support/package.json
COPY extensions/order-support/package.json extensions/order-support/package.json
RUN bun install --frozen-lockfile

COPY . .
RUN bunx prisma generate && bun run build
RUN bun install --frozen-lockfile --production

FROM node:22-alpine AS runtime

RUN apk add --no-cache openssl
WORKDIR /app
ENV NODE_ENV=production

COPY --from=builder /app /app
RUN rm -rf /usr/local/lib/node_modules/npm \
  && rm -f /usr/local/bin/npm /usr/local/bin/npx

USER node
EXPOSE 3000

CMD ["node", "scripts/container-start.mjs"]
