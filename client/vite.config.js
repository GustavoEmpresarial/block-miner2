import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  define: {
    'process.env.APP_URL': JSON.stringify(process.env.NODE_ENV === 'production' ? 'https://blockminer.space' : 'http://localhost:5000')
  },
  build: {
    rollupOptions: {
      output: {
        entryFileNames: `assets/index-${Date.now()}.js`,
        chunkFileNames: `assets/chunk-${Date.now()}.js`,
        assetFileNames: `assets/asset-${Date.now()}.[ext]`
      }
    }
  },
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
      '/socket.io': {
        target: 'http://localhost:3000',
        ws: true,
      }
    }
  }
})
