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
    build: {
      sourcemap: true,
      rolldownOptions: {
        output: {
          // Libraries change less often than app code, so ship them as
          // separately cached chunks.
          codeSplitting: {
            groups: [
              {
                name: 'react',
                test: /node_modules[\\/](react|react-dom|react-router|scheduler)[\\/]/,
              },
              { name: 'forms', test: /node_modules[\\/](react-hook-form|@hookform|zod)[\\/]/ },
              { name: 'vendor', test: /node_modules[\\/]/ },
            ],
          },
        },
      },
    },
    test: {
      environment: 'jsdom',
      include: ['tests/**/*.test.{js,jsx}'],
      setupFiles: ['./tests/setup.js'],
      restoreMocks: true,
      // Dates in tests render in a fixed zone, whatever the machine's.
      env: { TZ: 'UTC' },
    },
  };
});
