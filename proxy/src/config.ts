export const config = {
  port: parseInt(process.env.PORT ?? '3000', 10),
  // Always bind 0.0.0.0 — Railway sets HOST=127.0.0.1 which blocks external traffic
  host: '0.0.0.0',
  supabase: {
    url: process.env.SUPABASE_URL ?? '',
    anonKey: process.env.SUPABASE_ANON_KEY ?? '',
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? '',
    jwtSecret: process.env.SUPABASE_JWT_SECRET ?? '',
  },
  tunnelSecret: process.env.TUNNEL_SECRET ?? '',
  corsOrigins: process.env.CORS_ORIGINS
    ? process.env.CORS_ORIGINS.split(',').map(s => s.trim())
    : ['*'],
} as const;
