import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,

  // pdf-parse loads its worker and canvas bindings at runtime; bundling them
  // breaks those paths under Turbopack, so keep them as runtime dependencies.
  serverExternalPackages: ["pdf-parse", "@napi-rs/canvas"],

  experimental: {
    serverActions: {
      // The upload cap is 4 MB (Vercel's request limit is ~4.5 MB); leave a
      // little room for multipart overhead.
      bodySizeLimit: "5mb",
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
};

export default nextConfig;