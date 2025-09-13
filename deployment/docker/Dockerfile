# SSH Notify Tool - Production Docker Image
FROM node:18-alpine AS base

# Install system dependencies for notifications
RUN apk add --no-cache \
    dbus \
    libnotify \
    curl \
    bash \
    shadow \
    sudo \
    && rm -rf /var/cache/apk/*

# Create notification user
RUN addgroup -g 1001 -S notify && \
    adduser -S notify -u 1001 -G notify -s /bin/bash

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production && npm cache clean --force

# Copy application source
COPY src/ ./src/
COPY docs/ ./docs/
COPY examples/ ./examples/

# Create necessary directories
RUN mkdir -p /app/plugins /app/logs /app/config && \
    chown -R notify:notify /app

# Copy entrypoint script
COPY deployment/docker/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:3000/api/health || exit 1

# Expose port
EXPOSE 3000

# Switch to notification user
USER notify

# Set environment variables
ENV NODE_ENV=production
ENV NOTIFY_CONFIG_PATH=/app/config/config.json
ENV NOTIFY_PLUGINS_PATH=/app/plugins
ENV NOTIFY_LOGS_PATH=/app/logs

# Run the server
ENTRYPOINT ["/entrypoint.sh"]
CMD ["notify-server", "--config", "/app/config/config.json"]

# =============================================================================
# Multi-stage builds for different environments
# =============================================================================

# Development image
FROM base AS development
USER root
RUN npm install -g nodemon
USER notify
ENV NODE_ENV=development
CMD ["nodemon", "src/bin/notify-server.js", "--config", "/app/config/config.json"]

# Testing image
FROM base AS testing
USER root
COPY package*.json ./
RUN npm install
COPY tests/ ./tests/
COPY jest.config.js ./
USER notify
ENV NODE_ENV=test
CMD ["npm", "test"]

# Production image (default)
FROM base AS production
# Already configured in base stage