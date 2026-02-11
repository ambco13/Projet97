
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist',
    rollupOptions: {
      input: {
        main: './index.html'
      }
    }
  },
  server: {
    port: 3000
  }
});

// Helper simple pour le plugin react si non importé correctement dans cet environnement
function react() {
  return {
    name: 'vite-plugin-react-dummy'
  };
}
