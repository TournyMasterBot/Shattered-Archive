// apps\game-client\vite.config.ts
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react-swc';
import path from 'node:path';

export default defineConfig(({ mode }) => {
  // Load only VITE_* vars from .env files
  const env = loadEnv(mode, process.cwd(), 'VITE_');

  // Parse numeric port with a sane default
  const port = Number(env.VITE_PORT);

  // Targets
  const gameApiTarget = env.VITE_GAME_API; // e.g. http://localhost:31000
  const gameWsTarget = env.VITE_GAME_WS; // e.g. ws://localhost:31000
  const gameSecure = env.VITE_GAME_SECURE === 'true';

  const webApiTarget = env.VITE_WEB_API; // e.g. http://localhost:41000
  const webWsTarget = env.VITE_WEB_WS; // e.g. ws://localhost:41000
  const webSecure = env.VITE_WEB_SECURE === 'true';

  // Phase D: the C# service (Server.Web.Public) — a DIFFERENT backend from
  // web-server above, used for the game-sso hand-off + cloud-sync APIs.
  const siteApiTarget = env.VITE_SITE_API; // e.g. http://localhost:5000

  console.log('Loaded environment', {
    port,
    gameApiTarget,
    gameWsTarget,
    gameSecure,
    webApiTarget,
    webWsTarget,
    webSecure,
    siteApiTarget,
  });

  return {
    plugins: [react()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, 'src'),
        os: path.resolve(__dirname, 'src/shims/os-browser.ts'),
      },
    },
    server: {
      host: '0.0.0.0',
      port,
      strictPort: true,
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
          target: gameApiTarget, // http://localhost:31000
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
          target: webApiTarget, // http://localhost:41000
          ws: true,
          changeOrigin: true,
          secure: webSecure,
        },

        // HTTP → the C# service (Server.Web.Public): game-sso + cloud-sync APIs
        // /api/site/* (dev) -> /* on the site API — keeps these same-origin in
        // dev so no CORS is involved at all (see features/auth/siteApi.ts).
        '/api/site': {
          target: siteApiTarget,
          changeOrigin: true,
          rewrite: (p) => p.replace(/^\/api\/site/, ''),
        },
      },
    },
    build: {
      resolve: {
        dedupe: ['react', 'react-dom'],
      },
      rollupOptions: {
        input: {
          main: path.resolve(__dirname, 'index.html'),
          status: path.resolve(__dirname, 'status.html'),
          // The login popup's landing page. A real entry, not an asset: without
          // it the page 404s in the built image (dev serves root .html files
          // implicitly, so this only ever breaks in prod), and logging in hangs
          // until it times out. nginx try_files serves it as a plain file.
          authCallback: path.resolve(__dirname, 'auth-callback.html'),
        },
      },
    },
  };
});
