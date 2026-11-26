import path from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const API = process.env.API_URL || 'http://localhost:3000';

// Two builds share this file:
//   npm run build:web → dist/web, the website served by the OlimTalk server itself
//   npm run build:app → dist/app, the interface bundled inside the iOS / Android apps
const APP = process.env.OLIMTALK_TARGET === 'app';
if (APP && !process.env.VITE_API_URL) {
  throw new Error(
    'The mobile apps need the address of your OlimTalk server.\n' +
      'Example: VITE_API_URL=https://olimtalk.example npm run build:app',
  );
}

export default defineConfig({
  root: import.meta.dirname,
  plugins: [react()],
  build: {
    outDir: path.resolve(import.meta.dirname, APP ? '../dist/app' : '../dist/web'),
    emptyOutDir: true,
    chunkSizeWarningLimit: 700,
  },
  server: {
    port: 5173,
    fs: { allow: [path.resolve(import.meta.dirname, '..')] },
    proxy: {
      '/api': API,
      '/uploads': API,
      '/socket.io': { target: API, ws: true },
    },
  },
});
