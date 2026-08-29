import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "server-only": new URL("./src/test/server-only.ts", import.meta.url)
        .pathname,
    },
    tsconfigPaths: true,
  },
  test: {
    environment: "jsdom",
    hookTimeout: 30_000,
    setupFiles: ["./src/test/setup.ts"],
  },
});
