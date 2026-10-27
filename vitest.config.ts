import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

/**
 * Vitest mirrors the `@/*` alias declared in tsconfig.json so unit tests can
 * import the same modules the app does.
 */
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    include: ["src/**/*.test.ts"],
  },
});
