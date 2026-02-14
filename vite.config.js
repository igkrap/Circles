import { defineConfig } from 'vite';

// base:'./' makes the build work when hosted from a subpath or inside Capacitor.
export default defineConfig({
  base: './',
  server: {
    port: 5173,
    strictPort: true
  }
});
