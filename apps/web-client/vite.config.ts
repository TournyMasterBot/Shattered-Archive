import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react-swc';
import path from 'node:path';

export default defineConfig(({ mode }) => {
  // Load .env values
  const env = loadEnv(mode, process.cwd(), '');

  // Parse numeric port
  const port = Number(env.VITE_PORT);

  // Targets
  const webApiTarget = env.VITE_WEB_API;
  const webWsTarget = env.VITE_WEB_WS;
  const webSecure = env.VITE_WEB_SECURE === 'true';

  console.log('Loaded environment', {
    port,
    webApiTarget,
    webWsTarget,
    webSecure,
  });

  return {
    plugins: [react()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, 'src'),
      },
    },
    server: {
      port,
      strictPort: true,
      proxy: {
        // HTTP → web-server
        '/api/web': {
          target: webApiTarget,
          changeOrigin: true,
          secure: webSecure,
          rewrite: (p) => p.replace(/^\/api\/web/, ''),
        },

        // WebSocket → web-server
        '/ws/web': {
          target: webWsTarget,
          ws: true,
          changeOrigin: true,
          secure: webSecure,
        },
      },
    },
    build: {
      rollupOptions: {
        input: {
          main: path.resolve(__dirname, 'index.html'),
          status: path.resolve(__dirname, 'status.html'),
        },
      },
    },
  };
});
