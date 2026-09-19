import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    // Netlify publishes this directory; netlify.toml must stay in step with it.
    outDir: 'dist',
    sourcemap: false,
  },
  server: {
    port: 5173,
    // In development the API runs separately on :3000. Proxying it keeps the
    // browser same-origin, so cookies behave exactly as they do in production
    // without needing VITE_API_BASE_URL locally.
    proxy: {
      '/api': {
        target: process.env.VITE_DEV_API_TARGET || 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
});
