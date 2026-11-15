import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Dev-server API target: the local posclinic server by default; PROXY_TARGET=https://... for a remote one.
const apiTarget = process.env.PROXY_TARGET ?? 'http://localhost:4000';

export default defineConfig({
  plugins: [react()],
  resolve: {
    dedupe: ['react', 'react-dom', 'styled-components', 'i18next', 'react-i18next'],
    alias: {
      '@shared': path.resolve(__dirname, '../../src/shared'),
      '@renderer': path.resolve(__dirname, '../../src/renderer'),
      '@components/common': path.resolve(__dirname, '../../src/renderer/components/common'),
      '@theme': path.resolve(__dirname, '../../src/renderer/theme'),
      '@context': path.resolve(__dirname, '../../src/renderer/context'),
    },
  },
  server: {
    host: true,
    port: 5173,
    proxy: {
      '/api': {
        target: apiTarget,
        changeOrigin: true,
      },
      '/releases': {
        target: apiTarget,
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: '../../dist/web',
    emptyOutDir: true,
  },
  base: '/web/',
});
