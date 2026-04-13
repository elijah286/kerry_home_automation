import type { NextConfig } from 'next';

/** Set `CAPACITOR_STATIC=1` when building static assets for `npx cap sync` (bundled WebView). Default remains Docker/server `standalone`. */
const capacitorStatic =
  process.env.CAPACITOR_STATIC === '1' || process.env.CAPACITOR_STATIC === 'true';

const nextConfig: NextConfig = {
  ...(capacitorStatic
    ? {
        output: 'export' as const,
        images: { unoptimized: true },
      }
    : {
        output: 'standalone' as const,
      }),
  transpilePackages: ['@ha/shared'],
  experimental: {
    optimizePackageImports: ['lucide-react'],
  },
};

export default nextConfig;
