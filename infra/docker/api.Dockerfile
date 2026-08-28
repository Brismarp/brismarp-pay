FROM node:20-alpine AS base
WORKDIR /app

COPY apps/api/package.json apps/api/package-lock.json* ./apps/api/
COPY packages/database/schema.prisma ./packages/database/schema.prisma

WORKDIR /app/apps/api
RUN npm install

COPY apps/api ./
COPY packages/database ../../packages/database

RUN npm run prisma:generate
RUN npm run build

EXPOSE 3001
CMD ["npm", "run", "start:prod"]
