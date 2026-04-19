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
          return {
            // HLS segments are handled by the streaming Route Handler at
            // app/api/cameras/[name]/hls/[...path]/route.ts. Listing them as
            // beforeFiles rewrites (no-op) ensures the catch-all afterFiles rule
            // below never intercepts them before the Route Handler can run.
            beforeFiles: [
              {
                source: '/api/cameras/:name/hls/:path*',
                destination: '/api/cameras/:name/hls/:path*',
              },
            ],
            afterFiles: [
              { source: '/api/:path*', destination: `${internalApiOrigin}/api/:path*` },
            ],
            fallback: [],
          };
        },
      }),
  transpilePackages: ['@ha/shared'],
  experimental: {
    optimizePackageImports: ['lucide-react'],
  },
};

export default nextConfig;
