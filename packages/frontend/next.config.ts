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
        async headers() {
          // iOS Safari aggressively caches top-level HTML and can keep serving
          // a pre-deploy bundle indefinitely, making new releases look like
          // they never shipped. Next.js's own handler for /_next/static sets
          // immutable caching and takes precedence, so hashed JS/CSS stays
          // long-cached; this only forces HTML documents to revalidate.
          return [
            {
              source: '/:path*',
              headers: [
                { key: 'Cache-Control', value: 'no-store, must-revalidate' },
              ],
            },
          ];
        },
      }),
  transpilePackages: ['@ha/shared'],
  experimental: {
    optimizePackageImports: ['lucide-react'],
  },
};

export default nextConfig;
