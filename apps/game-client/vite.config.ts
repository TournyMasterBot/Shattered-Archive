import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react-swc';
import path from 'node:path';

export default defineConfig(({ mode }) => {
  // Load only VITE_* vars from .env files
  const env = loadEnv(mode, process.cwd(), 'VITE_');

  // Parse numeric port with a sane default
  const port = Number(env.VITE_PORT);
  const gameServerPort = Number(env.VITE_PORT_GAME_SERVER);
  const webServerPort = Number(env.VITE_PORT_WEB_SERVER);

  // Targets
  const gameApiTarget = env.VITE_GAME_API;    // e.g. http://localhost:30000
  const gameWsTarget = env.VITE_GAME_WS;      // e.g. ws://localhost:30000
  const gameSecure = env.VITE_GAME_SECURE === 'true';

  const webApiTarget = env.VITE_WEB_API;      // e.g. http://localhost:40000
  const webWsTarget = env.VITE_WEB_WS;        // e.g. ws://localhost:40000
  const webSecure = env.VITE_WEB_SECURE === 'true';

  console.log('Loaded environment', {
    port,
    gameApiTarget,
    gameWsTarget,
    gameSecure,
    webApiTarget,
    webWsTarget,
    webSecure,
  });

  return {
    plugins: [react()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, 'src'),
        os: path.resolve(__dirname, "src/shims/os-browser.ts"),
      },
    },
    server: {
      port,
      proxy: {
        // Convenience health endpoint → game-server
        // /api/health (dev) -> /health on game API
        '/api/health': {
          target: gameApiTarget,
          changeOrigin: true,
          secure: gameSecure,
          rewrite: (p) => p.replace(/^\/api/, ''), // /api/health -> /health
        },

        // HTTP → game-server
        // /api/game/* (dev) -> /* on game API
        '/api/game': {
          target: gameApiTarget,
          changeOrigin: true,
          secure: gameSecure,
          rewrite: (p) => p.replace(/^\/api\/game/, ''),
        },

        // WebSocket → game-server
        '/ws/game': {
          target: gameWsTarget,
          ws: true,
          changeOrigin: true,
          secure: gameSecure,
        },

        // HTTP → web-server
        // /api/web/* (dev) -> /* on web API
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
          main: path.resolve(__dirname, "index.html"),
          status: path.resolve(__dirname, "status.html"),
        },
      },
    }
  };
});
