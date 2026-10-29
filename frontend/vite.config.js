import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  // DEV_API_PROXY_TARGET has no VITE_ prefix, so it is never exposed to the browser bundle.
  const env = loadEnv(mode, process.cwd(), '');
  const apiTarget = env.DEV_API_PROXY_TARGET || 'http://localhost:4000';

  return {
    plugins: [react()],
    server: {
      port: 5173,
      strictPort: true,
      // In development the SPA calls same-origin /api/*, which Vite forwards to the
      // Express API. The browser still sends Origin: http://localhost:5173, so the
      // backend's FRONTEND_URL must include it.
      proxy: {
        '/api': { target: apiTarget, changeOrigin: true },
      },
    },
    preview: { port: 4173, strictPort: true },
    build: { sourcemap: true },
    test: {
      environment: 'jsdom',
      include: ['tests/**/*.test.{js,jsx}'],
      setupFiles: ['./tests/setup.js'],
      restoreMocks: true,
    },
  };
});
