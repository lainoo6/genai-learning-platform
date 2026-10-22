import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,

  experimental: {
    serverActions: {
      bodySizeLimit: "2mb",
      allowedOrigins: process.env.CODESPACE_NAME
        ? [
            "localhost:3000",
            `${process.env.CODESPACE_NAME}-3000.${
              process.env.GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN ??
              "app.github.dev"
            }`,
          ]
        : [],
    },
  },

  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;