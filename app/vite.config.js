import { defineConfig } from 'vite';

export default defineConfig({
  base: '/cash-flow/',
  root: '.',
  publicDir: 'public',
  server: {
    port: 3000,
    open: true
  }
});
