// apps\scrum-poker-client\vite.config.ts
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react-swc';
import path from 'node:path';

export default defineConfig(({ mode, command }) => {
  // Load only VITE_* vars from .env files
  const env = loadEnv(mode, process.cwd(), 'VITE_');

  // Port convention: game 30080/31000, web 40080/41000, KT 50080/51000,
  // mud-builder 60080/61000, auth 62080/62000 → scrum-poker 63080/63000.
  const port = Number(env.VITE_PORT) || 63080;

  // Target → scrum-poker-server (port 63000)
  const scrumApiTarget = env.VITE_SCRUM_API || 'http://localhost:63000';
  const scrumWsTarget = env.VITE_SCRUM_WS || 'ws://localhost:63000';
  const scrumSecure = env.VITE_SCRUM_SECURE === 'true';

  return {
    plugins: [react()],
    // Substituted as plain literals at build time. `import.meta.env` is deliberately NOT used
    // for these: this repo's Jest client setup cannot compile `import.meta` anywhere in a
    // module graph, which would make AdSlot and its importers untestable. See
    // src/features/shared/ad-config.ts.
    define: {
      __SP_AD_CLIENT__: JSON.stringify(env.VITE_AD_CLIENT ?? ''),
      __SP_AD_SLOT__: JSON.stringify(env.VITE_AD_SLOT ?? ''),
      __SP_DEV__: JSON.stringify(command === 'serve'),
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
        // The deployed app talks to same-origin relative paths (the edge nginx splits
        // /api and /ws/scrum off to the server); this proxy only reproduces that split
        // for `vite dev`, where the two run on different ports.
        '/api': {
          target: scrumApiTarget,
          changeOrigin: true,
          secure: scrumSecure,
        },
        '/health': {
          target: scrumApiTarget,
          changeOrigin: true,
          secure: scrumSecure,
        },
        '/ws/scrum': {
          target: scrumWsTarget,
          ws: true,
          changeOrigin: true,
          secure: scrumSecure,
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
