import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // Set base to your repo name for GitHub Pages
  // e.g. base: '/restaurant-scheduler/'
  base: '/hinks-scheduler/',
  build: {
    outDir: 'dist',
  },
});
