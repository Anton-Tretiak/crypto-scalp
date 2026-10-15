import { defineConfig } from 'vite';

// base: './' makes the build work on GitHub Pages sub-paths (user.github.io/repo/).
export default defineConfig({
  base: './',
  server: { port: 5173, open: true },
  build: { outDir: 'dist', sourcemap: true }
});
