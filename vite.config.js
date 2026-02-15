import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

const projectRoot = fileURLToPath(new URL('.', import.meta.url));
const indexHtml = fileURLToPath(new URL('./index.html', import.meta.url));

// base:'./' makes the build work when hosted from a subpath or inside Capacitor.
export default defineConfig({
  root: projectRoot,
  base: './',
  optimizeDeps: {
    entries: [indexHtml],
    include: ['phaser']
  },
  server: {
    host: true,
    port: 5173,
    strictPort: true
  },
  build: {
    chunkSizeWarningLimit: 1800,
    rollupOptions: {
      input: indexHtml,
      output: {
        manualChunks: {
          phaser: ['phaser']
        }
      }
    }
  }
});
