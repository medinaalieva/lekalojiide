/** @type {import('next').NextConfig} */
const backendApiUrl =
  process.env.INTERNAL_API_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  "http://127.0.0.1:4000";

const normalizedBackendUrl = backendApiUrl.replace(/\/+$/, "");

const nextConfig = {
  output: "standalone",
  reactStrictMode: true,
  images: {
    unoptimized: true,
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**",
      },
    ],
  },
  async rewrites() {
    return [
      {
        source: "/api/v1/:path*",
        destination: `${normalizedBackendUrl}/api/v1/:path*`,
      },
    ];
  },
};

module.exports = nextConfig;
