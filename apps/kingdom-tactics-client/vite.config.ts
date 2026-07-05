// apps\kingdom-tactics-client\vite.config.ts
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react-swc';
import path from 'node:path';

export default defineConfig(({ mode }) => {
  // Load only VITE_* vars from .env files
  const env = loadEnv(mode, process.cwd(), 'VITE_');

  // Parse numeric port with a sane default (proposed KT client port: 50080)
  const port = Number(env.VITE_PORT) || 50080;

  // Targets → kingdom-tactics-server (proposed port 51000)
  const ktApiTarget = env.VITE_KT_API; // e.g. http://localhost:51000
  const ktSecure = env.VITE_KT_SECURE === 'true';

  return {
    plugins: [react()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, 'src'),
      },
    },
    server: {
      host: '0.0.0.0',
      port,
      strictPort: true,
      proxy: ktApiTarget
        ? {
            // Convenience health endpoint → kingdom-tactics-server
            '/api/health': {
              target: ktApiTarget,
              changeOrigin: true,
              secure: ktSecure,
              rewrite: (p) => p.replace(/^\/api/, ''),
            },
            // HTTP → kingdom-tactics-server
            '/api/kt': {
              target: ktApiTarget,
              changeOrigin: true,
              secure: ktSecure,
              rewrite: (p) => p.replace(/^\/api\/kt/, ''),
            },
            // WebSocket → kingdom-tactics-server
            '/ws/kt': {
              target: ktApiTarget,
              ws: true,
              changeOrigin: true,
              secure: ktSecure,
            },
          }
        : undefined,
    },
    build: {
      resolve: {
        dedupe: ['react', 'react-dom'],
      },
    },
  };
});
