import { defineConfig } from 'vite';

export default defineConfig({
  publicDir: 'public',
  server: {
    port: 3000,
    open: false,
    allowedHosts: ["statute-morse-stowing.ngrok-free.dev"]
  },
  build: {
    target: 'esnext'
  }
});

