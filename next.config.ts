import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@amap/amap-jsapi-loader"],
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "lh3.googleusercontent.com",
      },
      {
        protocol: "https",
        hostname: "images.unsplash.com",
      },
    ],
  },
};

export default nextConfig;
