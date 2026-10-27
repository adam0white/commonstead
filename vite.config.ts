import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 1200,
    rollupOptions: { input: ['index.html', 'file/index.html'] },
  },
  worker: { format: 'es' },
});
