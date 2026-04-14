import type { NextConfig } from 'next';

/** Set `CAPACITOR_STATIC=1` when building static assets for `npx cap sync` (bundled WebView). Default remains Docker/server `standalone`. */
const capacitorStatic =
  process.env.CAPACITOR_STATIC === '1' || process.env.CAPACITOR_STATIC === 'true';

/** Browser → Next (80/3001) can use same-origin `/api/*`; Next proxies to the backend (avoids cross-port CORS / mixed-content blocks). */
const internalApiOrigin = (process.env.INTERNAL_API_ORIGIN ?? 'http://127.0.0.1:3000').replace(/\/$/, '');

const nextConfig: NextConfig = {
  ...(capacitorStatic
    ? {
        output: 'export' as const,
        images: { unoptimized: true },
      }
    : {
        output: 'standalone' as const,
        async rewrites() {
          return [{ source: '/api/:path*', destination: `${internalApiOrigin}/api/:path*` }];
        },
      }),
  transpilePackages: ['@ha/shared'],
  experimental: {
    optimizePackageImports: ['lucide-react'],
  },
};

export default nextConfig;
