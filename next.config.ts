import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,

  // pdf.js loads its worker and standard-font assets dynamically; bundling it
  // breaks those paths under Turbopack, so keep it as a runtime dependency.
  serverExternalPackages: ["pdfjs-dist", "@napi-rs/canvas"],

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