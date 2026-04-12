import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  transpilePackages: ['@ha/shared'],
  experimental: {
    optimizePackageImports: ['lucide-react'],
  },
};

export default nextConfig;
