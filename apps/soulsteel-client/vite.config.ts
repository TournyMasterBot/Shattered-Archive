// apps\soulsteel-client\vite.config.ts
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react-swc';
import path from 'node:path';

export default defineConfig(({ mode }) => {
  // Load only VITE_* vars from .env files
  const env = loadEnv(mode, process.cwd(), 'VITE_');

  // Port convention: game 30080/31000, web 40080/41000, KT 50080/51000, mud-builder 60080/61000,
  // auth 62080/62000, scrum-poker 63080/63000 -> soulsteel 64080/64000.
  const port = Number(env.VITE_PORT) || 64080;

  // Target -> soulsteel-server (port 64000). Phase 1 has no domain routes beyond /health, but
  // the proxy split is wired now so the Phase 2 archive routes need no vite.config changes.
  const apiTarget = env.VITE_SOULSTEEL_API || 'http://localhost:64000';
  const secure = env.VITE_SOULSTEEL_SECURE === 'true';

  return {
    plugins: [react()],
    // Substituted as a plain literal at build time, not `import.meta.env` — this repo's Jest
    // client setup cannot compile `import.meta` anywhere in a module graph, which would make
    // analytics.ts and its importers untestable. See src/features/shared/analytics.ts.
    define: {
      // Empty = no gtag script, no cookie, no request. See features/shared/analytics.ts.
      __SS_GA_ID__: JSON.stringify(env.VITE_GA_ID ?? ''),
    },
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
        // The deployed app talks to same-origin relative paths (the edge nginx splits /api off
        // to the server); this proxy only reproduces that split for `vite dev`, where the two
        // run on different ports.
        '/api': {
          target: apiTarget,
          changeOrigin: true,
          secure,
        },
        '/health': {
          target: apiTarget,
          changeOrigin: true,
          secure,
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
