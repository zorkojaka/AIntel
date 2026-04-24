import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

const devApiProxyTarget = process.env.AINTEL_DEV_API_PROXY_TARGET ?? `http://127.0.0.1:${process.env.AINTEL_BACKEND_PORT ?? "3000"}`;

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: [
      { find: "@", replacement: path.resolve(__dirname, "./src") },
      { find: /^@aintel\/shared\/(.*)$/, replacement: path.resolve(__dirname, "../../shared/$1") },
      { find: "@aintel/shared", replacement: path.resolve(__dirname, "../../shared") },
    ],
  },
  server: {
    port: 5175,
    proxy: {
      "/api": {
        target: devApiProxyTarget,
        changeOrigin: true,
      },
      "/uploads": {
        target: devApiProxyTarget,
        changeOrigin: true,
      },
    },
  },
});
