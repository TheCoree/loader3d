import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// The backend (backend/, `python -m app`) behind the same origin as in production (Caddy):
// no CORS, and the refresh-token cookie is first-party.
const apiProxy = { '/api': 'http://127.0.0.1:8000' };

export default defineConfig({
  plugins: [react()],
  server: { port: 5173, host: true, proxy: apiProxy },
  preview: { proxy: apiProxy },
  build: {
    rollupOptions: {
      output: { manualChunks: { three: ['three'] } },
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
