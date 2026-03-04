import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: [
      { find: '@', replacement: path.resolve(__dirname, 'src') },
      { find: /^@aintel\/shared\/(.*)$/, replacement: path.resolve(__dirname, '../../shared/$1') },
      { find: '@aintel/shared', replacement: path.resolve(__dirname, '../../shared') },
    ]
  },
  server: {
    port: 4173,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true
      }
    }
  }
});
