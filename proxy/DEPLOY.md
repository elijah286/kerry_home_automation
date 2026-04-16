# Proxy Service — Railway Deployment Guide

## Prerequisites

- A [Railway](https://railway.app) account
- A [Supabase](https://supabase.com) project
- The GitHub repo connected to Railway

---

## 1. Supabase Setup

### Create the `remote_users` table

Run this SQL in the Supabase SQL Editor (Dashboard > SQL Editor):

```sql
create table remote_users (
  id uuid primary key default gen_random_uuid(),
  supabase_uid uuid not null references auth.users(id) on delete cascade,
  home_role text not null default 'member' check (home_role in ('admin', 'member', 'guest')),
  allowed_areas text[],
  display_name text not null,
  created_at timestamptz default now(),
  unique(supabase_uid)
);

alter table remote_users enable row level security;
```

### Create remote user accounts

1. Go to **Authentication > Users** in the Supabase dashboard
2. Click **Add User** and create accounts for remote access users
3. For each user, insert a mapping row:

```sql
insert into remote_users (supabase_uid, home_role, allowed_areas, display_name)
values (
  'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx',  -- from auth.users.id
  'admin',                                  -- or 'member' / 'guest'
  null,                                     -- null = all areas, or ARRAY['area-id-1', 'area-id-2']
  'Your Name'
);
```

### Collect credentials

From **Settings > API** in the Supabase dashboard, note:

| Value | Where to find it |
|---|---|
| `SUPABASE_URL` | Project URL (e.g., `https://xxxxx.supabase.co`) |
| `SUPABASE_ANON_KEY` | Project API keys > `anon` `public` |
| `SUPABASE_SERVICE_ROLE_KEY` | Project API keys > `service_role` (keep secret) |
| `SUPABASE_JWT_SECRET` | Settings > API > JWT Settings > JWT Secret |

---

## 2. Generate a Tunnel Secret

Generate a strong random secret to share between the proxy and home instance:

```bash
openssl rand -hex 32
```

This value will be set as `TUNNEL_SECRET` on both Railway and the home backend.

---

## 3. Railway Deployment

### Connect the repository

1. Log in to [Railway](https://railway.app)
2. Click **New Project > Deploy from GitHub Repo**
3. Select the `home-automation` repository

### Create the proxy service

1. Click **New Service > GitHub Repo** (or use the already-connected repo)
2. Railway auto-detects `railway.toml` at the repo root, which configures the Dockerfile builder and health checks. No manual settings needed.

### Set environment variables

In the service **Variables** tab, add:

| Variable | Value |
|---|---|
| `SUPABASE_URL` | From Supabase dashboard |
| `SUPABASE_ANON_KEY` | From Supabase dashboard |
| `SUPABASE_SERVICE_ROLE_KEY` | From Supabase dashboard |
| `SUPABASE_JWT_SECRET` | From Supabase dashboard |
| `TUNNEL_SECRET` | The secret generated in step 2 |
| `CORS_ORIGINS` | Your frontend domain (e.g., `https://ha.yourdomain.com`) |

`PORT` is automatically provided by Railway.

### Custom domain (optional)

1. Go to **Settings > Networking > Custom Domain**
2. Add your domain (e.g., `ha-proxy.yourdomain.com`)
3. Set the DNS CNAME as instructed

### Deploy

Railway will build and deploy automatically on push. The health check endpoint is `GET /health`.

---

## 4. Home Instance Configuration

On the home backend, add these environment variables (in `.env` or your process manager):

```bash
# URL of the deployed Railway proxy (include https://)
PROXY_URL=https://ha-proxy.up.railway.app

# Must match the TUNNEL_SECRET set on Railway
TUNNEL_SECRET=your-generated-secret

# Unique identifier for this home instance (optional, defaults to 'home-1')
HOME_ID=home-1
```

Restart the backend. It will automatically connect to the proxy via outbound WebSocket.

---

## 5. Frontend Configuration (for remote access build)

To build a frontend that connects through the proxy instead of directly to the local backend:

```bash
NEXT_PUBLIC_API_URL=https://ha-proxy.up.railway.app
NEXT_PUBLIC_WS_URL=wss://ha-proxy.up.railway.app/ws
NEXT_PUBLIC_AUTH_MODE=remote
```

The login page will use email/password (Supabase auth) instead of local username/password.

---

## 6. Verifying the Setup

1. **Check proxy health**: `curl https://ha-proxy.up.railway.app/health`
   - Should return `{"status":"ok","tunnel":"connected",...}`
2. **Check tunnel**: The `tunnel` field should say `connected` once the home backend is running
3. **Test login**: `POST /auth/login` with `{"email":"...","password":"..."}`
4. **Test API proxy**: `GET /api/health` with `Authorization: Bearer <token>`

---

## Architecture Summary

```
Remote Browser
    |
    | HTTPS / WSS
    v
Railway Proxy (this service)
    |
    | Validates Supabase JWT
    | Looks up remote_users table
    | Forwards through tunnel
    |
    v
Home Backend (outbound WSS tunnel)
    |
    | fastify.inject() for REST
    | Virtual WS sessions for real-time
    | go2rtc relay for WebRTC signaling
    v
Local devices, cameras, automation
```

No inbound ports are opened on the home network. The home instance initiates and maintains the tunnel connection.
