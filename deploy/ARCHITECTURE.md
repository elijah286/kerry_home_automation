# Deployment & Update Architecture

## Overview

The system uses a CI/CD pipeline (GitHub Actions) to build Docker images on every
push to `main`. The home hub pulls pre-built images instead of building from source,
making updates fast (~30 seconds) and reliable.

```
Developer pushes to main
     │
     ▼
GitHub Actions CI/CD
  ├── Build backend image → ghcr.io/elijah286/ha-backend:<version>
  ├── Build frontend image → ghcr.io/elijah286/ha-frontend:<version>
  ├── Build roborock-bridge image → ghcr.io/elijah286/ha-roborock-bridge:<version>
  ├── Build proxy image → ghcr.io/elijah286/ha-proxy:<version>
  ├── Generate deploy/release-manifest.json
  └── Create GitHub Release (on version bump)
     │
     ▼
Home Hub (Settings → Software Update)
  1. git fetch origin main
  2. Compare HEAD vs origin/main
  3. User clicks "Install update"
  4. git pull (config + scripts)
  5. docker compose pull (pre-built images)
  6. docker compose up -d (no build)
  7. Health check + verification
  8. Progress streamed to UI via SSE
```

## Versioning

**Single source of truth:** `packages/frontend/src/lib/app-version.json`

```json
{ "major": 3, "minor": 14, "patch": 33 }
```

- **major (A):** User-controlled; rarely changes
- **minor (B):** Bumped for major features/integrations
- **patch (C):** Bumped for fixes and small changes

The version is baked into Docker images at build time via `BUILD_VERSION` and
`BUILD_SHA` build args. The CI/CD pipeline reads the version and tags images
accordingly.

## Update Flow

### Pre-built Image Flow (default)

1. `scripts/deploy.sh` handles the full lifecycle
2. Writes structured JSONL progress to `.update-progress.jsonl`
3. Backend streams progress to frontend via SSE (`/api/system/update/progress`)
4. Frontend shows stage-by-stage progress with log viewer

### Build-from-Source Fallback

If pre-built images are not available (first deploy before CI/CD runs, or
registry auth issues), the deploy script falls back to `docker compose up -d --build`.

### Rollback

Previous deployment state is saved to `.deploy-previous-state.json`. Rollback
restores the previous image tags and git commit, then restarts services. Since
previous images are cached locally, rollback is near-instant.

## CI/CD Setup

### Prerequisites

1. Push the repo to GitHub (already done)
2. The workflow at `.github/workflows/release.yml` runs automatically

### Authenticating the Home Hub with ghcr.io

On the Ubuntu PC (one-time setup):

```bash
# Create a GitHub Personal Access Token with read:packages scope
# Then login:
echo "YOUR_TOKEN" | docker login ghcr.io -u elijah286 --password-stdin
```

Docker will save the credentials to `~/.docker/config.json`. All subsequent
`docker compose pull` commands will use these credentials automatically.

## docker-compose.prod.yml

Services use both `image:` and `build:` directives:

```yaml
backend:
  image: ${HA_BACKEND_IMAGE:-ghcr.io/elijah286/ha-backend:latest}
  build:
    context: .
    dockerfile: packages/backend/Dockerfile.prod
```

- `docker compose pull` → pulls from ghcr.io
- `docker compose up -d` → uses pulled image (fast, no build)
- `docker compose up -d --build` → builds from source (fallback)

Image tags are set via environment variables in `.env`:
```
HA_BACKEND_IMAGE=ghcr.io/elijah286/ha-backend:v3.14.34
HA_FRONTEND_IMAGE=ghcr.io/elijah286/ha-frontend:v3.14.34
HA_ROBOROCK_IMAGE=ghcr.io/elijah286/ha-roborock-bridge:v3.14.34
```

The deploy script updates these automatically during deployment.

## Health Checks & Watchdog

- All Docker services have health checks defined in compose
- Backend: `curl /api/health` every 10s
- Systemd watchdog (`home-automation-watchdog.timer`) runs every 2 minutes
- The deploy script uses a file lock (`/tmp/ha-deploy.lock`) that the watchdog
  should also check to avoid interfering with active deployments

## Database Migrations

Migrations run forward-only on backend startup (`packages/backend/src/db/migrate.ts`).
The deploy script takes a `pg_dump` backup before restarting services. If the new
version fails to start, the database can be restored from the backup.

## Logging

- Deploy progress: `.update-progress.jsonl` (JSONL, read by backend for SSE)
- Traditional log: `/var/log/home-automation/update.log` (rolling 500 lines)
- Backend logs: Pino structured JSON to stdout (captured by Docker)

---

## Remote Proxy Architecture

### Design: Command-Proxy (No Data Sync)

The remote access architecture uses a **command-proxy pattern**. The cloud-hosted
proxy is a pure relay with **no local database or data store**. All data flows
through a WebSocket tunnel to the home hub.

```
Remote Browser
     │
     ▼
Cloud Proxy (Railway / Fly.io / Docker)
  ├── Supabase Auth (JWT verification)
  ├── HTTP Proxy (/api/* → tunnel → home backend)
  ├── WebSocket Proxy (/ws → tunnel → home backend)
  └── Frontend (Next.js static)
     │
     │  WebSocket Tunnel (HMAC-authenticated)
     │
     ▼
Home Hub (Ubuntu PC, behind NAT)
  ├── Backend (Fastify :3000) — source of truth for ALL data
  ├── Frontend (Next.js :3001)
  ├── PostgreSQL, Redis, integrations
  └── Tunnel client (connects outbound to proxy)
```

### Why No Data Sync

- **Zero consistency problems:** No two-database divergence to reconcile
- **No stale data:** Every API call returns live data from the home hub
- **Simpler operations:** One database to manage, backup, and migrate
- **Security:** Sensitive data never leaves the home network at rest

### Graceful Offline Handling

When the home hub is offline (power outage, maintenance, etc.):

1. Proxy detects tunnel disconnection (heartbeat timeout)
2. HTTP requests return `503 Hub Offline` with a human-readable message
3. WebSocket clients receive a `tunnel_disconnected` event
4. Frontend shows "Home hub is offline" state
5. When the tunnel reconnects, service resumes automatically

### Proxy Deployment

The proxy image is built by CI/CD alongside the other services:
```
ghcr.io/elijah286/ha-proxy:<version>
```

Deploy to Railway, Fly.io, or any Docker host:
```bash
docker run -d \
  -e PORT=3000 \
  -e SUPABASE_URL=... \
  -e SUPABASE_ANON_KEY=... \
  -e SUPABASE_SERVICE_ROLE_KEY=... \
  -e SUPABASE_JWT_SECRET=... \
  -e TUNNEL_SECRET=<shared-secret> \
  -e CORS_ORIGINS=https://your-domain.com \
  -p 3000:3000 \
  ghcr.io/elijah286/ha-proxy:latest
```

### Authentication Flow

1. Remote user authenticates via Supabase (email/password or OAuth)
2. Supabase issues a JWT
3. Browser sends JWT with API requests to the proxy
4. Proxy verifies JWT against Supabase, extracts user identity
5. Proxy forwards the request through the tunnel with user context
6. Home backend processes the request using its local auth/RBAC system

### Future Considerations

- **Static data caching:** The proxy could cache immutable data (device names,
  area definitions) to reduce tunnel round-trips and improve offline UX
- **Push notifications:** The proxy could store notification preferences and
  forward events even when no browser is connected
- **Multi-home support:** The tunnel manager currently accepts one connection;
  extending to multiple home instances would require routing by home ID
