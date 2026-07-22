// apps\auth-client\vite.config.ts
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react-swc';
import path from 'node:path';

export default defineConfig(({ mode }) => {
  // Load only VITE_* vars from .env files
  const env = loadEnv(mode, process.cwd(), 'VITE_');

  // Port convention: game 30080/31000, web 40080/41000, KT 50080/51000, mud-builder
  // 60080/61000 → auth 62080/62000 (docs/ports.md).
  const port = Number(env.VITE_PORT) || 62080;

  // Target → auth-server (port 62000)
  const authApiTarget = env.VITE_AUTH_API || 'http://localhost:62000';
  const authSecure = env.VITE_AUTH_SECURE === 'true';

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
      proxy: {
        // Proxied (not cross-origin) so the browser sees auth-server's Set-Cookie as
        // same-origin — auth-client never reads/stores the session cookie itself.
        '/api': {
          target: authApiTarget,
          changeOrigin: true,
          secure: authSecure,
        },
        '/health': {
          target: authApiTarget,
          changeOrigin: true,
          secure: authSecure,
        },
      },
    },
    build: {
      resolve: {
        dedupe: ['react', 'react-dom'],
      },
    },
  };
});
