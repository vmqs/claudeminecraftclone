import { defineConfig } from 'vite';

export default defineConfig({
  // Relative base so the build works from any GitHub Pages sub-path.
  base: './',
  build: {
    target: 'es2022',
    outDir: 'dist',
    assetsInlineLimit: 0,
    chunkSizeWarningLimit: 4096,
  },
  worker: {
    format: 'es',
  },
  server: {
    port: 5173,
    host: true,
  },
});
