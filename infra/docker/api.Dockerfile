FROM node:20-bookworm-slim AS base
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app

COPY apps/api/package.json apps/api/package-lock.json* ./apps/api/
COPY packages/database/schema.prisma ./packages/database/schema.prisma

WORKDIR /app/apps/api
RUN npm install --include=dev

COPY apps/api ./
COPY packages/database ../../packages/database

RUN npm run prisma:generate
RUN rm -rf dist tsconfig.tsbuildinfo && npm run build

ENV NODE_ENV=production
EXPOSE 3001
# Same image serves the HTTP API and the BullMQ worker. Railway sets RAILWAY_SERVICE_NAME.
CMD ["sh", "-c", "if [ \"$RAILWAY_SERVICE_NAME\" = \"worker\" ]; then exec npm run worker:recovery; else npm run prisma:deploy && exec npm run start:prod; fi"]
