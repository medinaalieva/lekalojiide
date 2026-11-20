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
    formats: ["image/avif", "image/webp"],
    remotePatterns: [
      {
        protocol: "https",
        hostname: "susoqzykfmwivajdkvtb.storage.supabase.co",
        pathname: "/storage/v1/object/public/**",
      },
      {
        protocol: "https",
        hostname: "images.unsplash.com",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "**",
      },
      {
        protocol: "http",
        hostname: "**",
      },
    ],
  },
  async redirects() {
    return [
      {
        source: "/catalog/pizharnyj-komplekt-komfort",
        destination: "/catalog/pizhamnyj-komplekt-komfort",
        permanent: true,
      },
    ];
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
