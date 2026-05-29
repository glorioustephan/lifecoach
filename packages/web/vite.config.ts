import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { TanStackRouterVite } from "@tanstack/router-vite-plugin";

export default defineConfig({
  plugins: [
    TanStackRouterVite({
      routesDirectory: "./src/routes",
      generatedRouteTree: "./src/routeTree.gen.ts",
      autoCodeSplitting: true,
    }),
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      "~": path.resolve(__dirname, "./src"),
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    port: 3718,
    strictPort: true,
    proxy: {
      // Forward API + health to the Hono server during dev. Use 127.0.0.1
      // explicitly — `localhost` resolves to IPv6 (::1) first on newer Node,
      // and the Hono server only binds IPv4, producing noisy
      // `AggregateError [ECONNREFUSED]` logs even though the IPv4 retry
      // succeeds. Pinning to 127.0.0.1 skips the IPv6 attempt entirely.
      "/api": "http://127.0.0.1:3717",
      "/health": "http://127.0.0.1:3717",
    },
  },
  build: {
    outDir: "dist",
    sourcemap: true,
  },
});
