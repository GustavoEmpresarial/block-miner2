# Stage 1: Build React Frontend
FROM node:20-bookworm-slim AS frontend-builder
WORKDIR /app
COPY client/package*.json ./
RUN npm ci
COPY client/ ./
RUN npm run build

# Stage 2: Serve Backend
FROM node:20-bookworm-slim
WORKDIR /app
LABEL maintainer="blockminer"

# OpenSSL is required by Prisma.
RUN apt-get update && \
    apt-get install -y openssl rclone ca-certificates && \
    update-ca-certificates && \
    rm -rf /var/lib/apt/lists/*

# Install production dependencies
COPY package*.json ./
RUN npm ci --omit=dev

# Copy Prisma schema and config, then generate client
COPY server/prisma ./server/prisma/
COPY prisma.config.js ./
RUN npx prisma generate --schema=server/prisma/schema.prisma

# Copy the rest of the application
COPY . .

# Copy compiled React SPA into the backend container
COPY --from=frontend-builder /app/dist ./client/dist

# Create necessary directories
RUN mkdir -p data backups logs

ENV NODE_ENV=production

EXPOSE 3000

# Use an entrypoint script to run migrations automatically before starting
COPY docker-entrypoint.sh /usr/local/bin/
RUN sed -i 's/\r$//' /usr/local/bin/docker-entrypoint.sh && \
    chmod +x /usr/local/bin/docker-entrypoint.sh

ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["node", "server/server.js"]
