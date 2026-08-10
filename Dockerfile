FROM node:22-alpine AS builder

RUN apk add --no-cache openssl
WORKDIR /app

COPY package.json package-lock.json ./
COPY extensions/customer-support/package.json extensions/customer-support/package.json
COPY extensions/order-support/package.json extensions/order-support/package.json
RUN npm ci

COPY . .
RUN npx prisma generate && npm run build

FROM node:22-alpine AS runtime

RUN apk add --no-cache openssl
WORKDIR /app
ENV NODE_ENV=production

COPY --from=builder /app /app
RUN npm prune --omit=dev \
  && npm cache clean --force \
  && rm -rf /usr/local/lib/node_modules/npm \
  && rm -f /usr/local/bin/npm /usr/local/bin/npx

USER node
EXPOSE 3000

CMD ["node", "scripts/container-start.mjs"]
