import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import sass from 'sass';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');

  return {
    plugins: [react()],
    css: {
      preprocessorOptions: {
        scss: {
          implementation: sass,
          api: 'modern', // Forces Vite to use the modern Sass API
        },
      },
    },
    optimizeDeps: {
      include: ['sass'], // Forces Vite to use modern Sass
    },
    build: {
      outDir: path.resolve(__dirname, 'dist'),
    },
    define: {
      __VITE_ENV__: JSON.stringify({
        VITE_GAME_SERVER: `${env.VITE_GAME_SERVER_SCHEMA}${env.VITE_GAME_SERVER_HOST}:${env.VITE_GAME_SERVER_PORT}`,
        VITE_WEB_SERVER: `${env.VITE_WEB_SERVER_SCHEMA}${env.VITE_WEB_SERVER_HOST}:${env.VITE_WEB_SERVER_PORT}`,
      }),
    },
    resolve: {
      alias: {},
    },
    server: {
      host: '0.0.0.0',
      port: 8080,
      proxy: {
        '/game-server': {
          target: `${env.VITE_GAME_SERVER_SCHEMA}${env.VITE_GAME_SERVER_HOST}:${env.VITE_GAME_SERVER_PORT}`,
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/game-server/, ''),
        },
        '/web-server': {
          target: `${env.VITE_WEB_SERVER_SCHEMA}${env.VITE_WEB_SERVER_HOST}:${env.VITE_WEB_SERVER_PORT}`,
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/web-server/, ''),
        },
      },
      allowedHosts: ['dsl.shatteredarchive.com'],
      watch: {},
    },
  };
});
