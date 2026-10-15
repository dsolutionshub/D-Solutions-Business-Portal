import path from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': path.resolve(import.meta.dirname, 'src') }
  },
  build: {
    rollupOptions: {
      output: {
        // Framework code changes rarely: keep it in its own chunk so app deploys don't bust its cache.
        manualChunks: id =>
          /node_modules\/(react|react-dom|scheduler|react-router|@tanstack)\//.test(id.replace(/\\/g, '/'))
            ? 'vendor'
            : undefined
      }
    }
  },
  server: {
    port: Number(process.env.VITE_PORT) || 5173,
    strictPort: !!process.env.VITE_PORT,
    // In dev the Worker runs on wrangler dev (:8787; end-to-end tests use their own); in production
    // it is served on the same host under /api.
    proxy: { '/api': process.env.API_PROXY || 'http://localhost:8787' }
  }
});
