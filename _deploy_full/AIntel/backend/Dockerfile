# syntax=docker/dockerfile:1.4

FROM node:20-bullseye AS deps
WORKDIR /app

COPY backend/package.json backend/package-lock.json ./

RUN npm ci
RUN apt-get update && apt-get install -y --no-install-recommends wget gnupg ca-certificates && rm -rf /var/lib/apt/lists/*
RUN npx playwright install --with-deps chromium

FROM node:20-bullseye AS build
WORKDIR /app/backend
COPY --from=deps /app/node_modules ./node_modules
COPY backend/ ./
RUN npm run build
RUN npm prune --omit=dev

FROM node:20-bullseye-slim AS runner
WORKDIR /app
ENV NODE_ENV=production

COPY --from=build /app/backend/node_modules ./node_modules
COPY --from=build /app/backend/dist ./dist
COPY backend/package.json ./

EXPOSE 3000
CMD ["node", "dist/server.js"]
