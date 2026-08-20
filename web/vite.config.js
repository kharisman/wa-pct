import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Dev: proxy API + webhook + SSE ke backend Express (port 3000)
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': { target: 'http://localhost:3000', changeOrigin: true },
      '/media': 'http://localhost:3000',
      '/webhook': 'http://localhost:3000',
    },
  },
});
