# syntax=docker/dockerfile:1

# ============================================
# Builder Stage
# ============================================
FROM oven/bun:1 AS builder

WORKDIR /app

# Copy package files
COPY package.json bun.lock* ./

# Install dependencies (including devDependencies for build)
RUN bun install --frozen-lockfile

# Copy source code
COPY index.ts ./

# Build the application (standalone bundle)
RUN bun build index.ts \
  --target=bun \
  --outdir=dist \
  --minify

# ============================================
# Runtime Stage
# ============================================
FROM oven/bun:1-alpine AS runtime

WORKDIR /app

# Copy only the built bundle (no node_modules needed!)
COPY --from=builder /app/dist/index.js ./

# Set environment
ENV NODE_ENV=production
ENV PORT=3000

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD bun --eval "fetch('http://localhost:' + (process.env.PORT || 3000) + '/health').then(r => r.ok ? process.exit(0) : process.exit(1))" || exit 1

# Run as non-root user
USER bun

# Start the bundled application
CMD ["bun", "index.js"]
