/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    serverActions: { bodySizeLimit: '5mb' },
  },
  transpilePackages: ['@cr/db', '@cr/shared'],
  images: {
    remotePatterns: [{ protocol: 'https', hostname: '**' }],
  },
  eslint: { ignoreDuringBuilds: false },
  typescript: { ignoreBuildErrors: false },
};

export default nextConfig;
