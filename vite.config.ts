import { defineConfig } from "vite";
import path from "path";

export default defineConfig({
  plugins: [],
  root: path.resolve(import.meta.dirname, "ui"),
  publicDir: path.resolve(import.meta.dirname, "ui", "public"),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/control-ui"),
    emptyOutDir: true,
    sourcemap: true,
  },
  server: {
    proxy: {
      "/ws": {
        target: "ws://localhost:8080",
        ws: true,
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/ws/, ""),
      },
    },
    fs: {
      strict: false,
      deny: ["**/.*"],
    },
  },
});
