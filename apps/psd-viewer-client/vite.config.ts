// apps\psd-viewer-client\vite.config.ts
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react-swc';
import path from 'node:path';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');

  // Port convention: game 30080/31000, web 40080/41000, KT 50080/51000,
  // mud-builder 60080/61000 → psd-viewer 62080/62000 (65535 ceiling rules out 7xxxx).
  const port = Number(env.VITE_PORT) || 62080;
  const apiTarget = env.VITE_PSD_API || 'http://localhost:62000';

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
        '/api': { target: apiTarget, changeOrigin: true },
        '/health': { target: apiTarget, changeOrigin: true },
      },
    },
  };
});
