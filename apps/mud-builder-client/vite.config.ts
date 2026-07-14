// apps\mud-builder-client\vite.config.ts
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react-swc';
import path from 'node:path';

export default defineConfig(({ mode }) => {
  // Load only VITE_* vars from .env files
  const env = loadEnv(mode, process.cwd(), 'VITE_');

  // Port convention: game 30080/31000, web 40080/41000, KT 50080/51000 → mud-builder 60080/61000
  const port = Number(env.VITE_PORT) || 60080;

  // Target → mud-builder-server (port 61000)
  const builderApiTarget = env.VITE_BUILDER_API || 'http://localhost:61000';
  const builderSecure = env.VITE_BUILDER_SECURE === 'true';

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
        // HTTP → mud-builder-server (paths pass through unchanged: server serves /api/*)
        '/api': {
          target: builderApiTarget,
          changeOrigin: true,
          secure: builderSecure,
        },
        '/health': {
          target: builderApiTarget,
          changeOrigin: true,
          secure: builderSecure,
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
