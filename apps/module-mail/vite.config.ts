import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: [
      { find: '@aintel/shared', replacement: path.resolve(__dirname, '../../shared') },
      { find: /^@aintel\/shared\/(.*)$/, replacement: path.resolve(__dirname, '../../shared/$1') },
    ],
  },
  server: {
    port: 5182,
  },
});
