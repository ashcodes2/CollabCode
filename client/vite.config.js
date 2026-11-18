import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:3001',
        changeOrigin: true,
      },
      '/socket.io': {
        target: 'http://127.0.0.1:3001',
        changeOrigin: true,
        ws: true,
      },
    },
  },
  build: {
    chunkSizeWarningLimit: 1000,
    rolldownOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('@monaco-editor') || id.includes('monaco-editor')) {
            return 'monaco';
          }
          if (id.includes('@xterm') || id.includes('xterm')) {
            return 'xterm';
          }
          if (id.includes('@react-three') || (id.includes('three') && !id.includes('react-three-fiber'))) {
            return 'three';
          }
          if (id.includes('/yjs') || id.includes('y-monaco') || id.includes('y-protocols')) {
            return 'yjs';
          }
          if (id.includes('react-dom') || id.includes('react-router')) {
            return 'react-vendor';
          }
        },
      },
    },
  },
})
