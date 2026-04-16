FROM node:22-alpine AS builder

WORKDIR /app

# Copy the base tsconfig (proxy/tsconfig.json and shared/tsconfig.json both extend it)
COPY tsconfig.base.json tsconfig.base.json

# Copy the legacy shared types package (proxy imports type-only from @home-automation/shared)
COPY shared/ shared/

# Copy proxy package files for layer-cached install
COPY proxy/package.json proxy/

# Create a minimal root package.json with the correct workspaces for this build
RUN printf '{"private":true,"workspaces":["shared","proxy"]}\n' > package.json

# Install dependencies (generates a fresh lockfile for this workspace subset)
RUN npm install --workspaces

# Copy proxy source and build
COPY proxy/ proxy/
WORKDIR /app/proxy
RUN npm run build

# Prune dev-only dependencies so the runtime image stays lean.
# @home-automation/shared is type-only (erased by tsc), so remove the
# workspace link — it would be a broken symlink in the runtime image anyway.
WORKDIR /app
RUN npm prune --omit=dev --workspaces \
    && rm -rf shared proxy/src proxy/node_modules

# ---------------------------------------------------------------------------
FROM node:22-alpine

ARG BUILD_VERSION=dev
ARG BUILD_SHA=unknown
LABEL org.opencontainers.image.version="${BUILD_VERSION}" \
      org.opencontainers.image.revision="${BUILD_SHA}"

WORKDIR /app

# Copy built output and production dependencies (hoisted to /app/node_modules by npm workspaces)
COPY --from=builder /app/proxy/dist ./dist
COPY --from=builder /app/proxy/package.json ./
COPY --from=builder /app/node_modules ./node_modules

EXPOSE 3000
CMD ["node", "dist/proxy/src/index.js"]
