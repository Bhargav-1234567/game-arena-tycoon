import { defineConfig } from 'vite';

export default defineConfig({
  publicDir: 'public',
  server: {
    port: 3000,
    open: false,
    watch: { ignored: ['**/test-results/**', '**/playwright-report/**', '**/artifacts/**'] },
    allowedHosts: ["statute-morse-stowing.ngrok-free.dev"]
  },
  build: {
    target: 'esnext',
    rollupOptions: { input: { game: 'index.html', characters: 'custom-characters.html' } }
  }
});

