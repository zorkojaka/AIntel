import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@aintel/shared': path.resolve(__dirname, '../../shared')
    }
  },
  server: {
    port: 5177
  }
});
