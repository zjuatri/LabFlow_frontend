import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Allow larger uploads (PDF) to pass through Next dev proxy without truncation.
    // See: https://nextjs.org/docs/app/api-reference/config/next-config-js/proxyClientMaxBodySize
    proxyClientMaxBodySize: '50mb',
  },
  async rewrites() {
    const backend = process.env.BACKEND_URL || 'http://localhost:8000';
    return [
      // Proxy all /api and /static to backend.
      // Note: The table formula vision endpoint now calls backend directly from browser
      // to avoid the ~30s proxy timeout, so no need to exclude it here.
      // Exclude /api/fs from proxying (let Next.js handle it)
      {
        source: '/api/fs/:path*',
        destination: '/api/fs/:path*',
      },
      {
        source: '/api/:path*',
        destination: `${backend}/api/:path*`,
      },
      {
        source: '/static/:path*',
        destination: `${backend}/static/:path*`,
      },
    ];
  },
};

export default nextConfig;
