import type { NextConfig } from "next";
import path from "path";

const nextConfig: any = {
  /* config options here */
  turbopack: {
    // Force Turbopack to treat the project folder as the root to avoid HMR ignoring updates
    root: path.resolve('.')
  },
  experimental: {
    // Optional additional configurations if needed
  },
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api'}/:path*`,
      },
    ];
  },
  transpilePackages: [],
  webpack: (config: any) => {
    return config;
  }
};

export default nextConfig;
