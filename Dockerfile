# Stage 1: Build & Generate Prisma Client
FROM node:20-bookworm-slim AS builder

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
COPY prisma ./prisma/

RUN npm ci

# Generate Prisma Client
RUN npx prisma generate

COPY . .

# Build NestJS application
RUN npm run build

# Remove development dependencies to keep production light
RUN npm prune --production

# Stage 2: Production Runner
FROM node:20-bookworm-slim AS runner

WORKDIR /app

# Install runtime dependencies for glibc & native binaries (sharp, onnxruntime)
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates openssl && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production
ENV PORT=4000

# Security: run as non-root user
RUN groupadd --system --gid 1001 nodejs && \
    useradd --system --uid 1001 -g nodejs nestjs

# Pre-create uploads directory with proper ownership
RUN mkdir -p /app/uploads && chown -R nestjs:nodejs /app/uploads

COPY --from=builder /app/package*.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma

USER nestjs

EXPOSE 4000

CMD ["node", "dist/src/main"]

