// apps/shattered-maps-client/vite.config.ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react-swc';
import path from 'node:path';

// Port 22080: the next free client port of the registry (docs/ports.md); the Mapper's own 8085 sat in the legacy range.
export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 22080,
    strictPort: true,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      '@state': path.resolve(__dirname, 'src/state'),
      '@components': path.resolve(__dirname, 'src/components'),
    },
    dedupe: ['react', 'react-dom'],
  },
});
