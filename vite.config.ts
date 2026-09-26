import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // `npm run dev:functions` serves the Pages Functions on :8788
    proxy: { '/api': 'http://127.0.0.1:8788' },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
