import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Relative base so Flask can serve the built assets from any mount point.
  base: './',
  server: {
    // Dev proxy: forward API calls to the running Flask backend.
    proxy: {
      '/api': 'http://127.0.0.1:5000',
    },
  },
  build: {
    rollupOptions: {
      output: {
        // Split heavy vendors into their own chunks for better caching and
        // to keep the main bundle lean (charts/d3 are the bulk of the weight).
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (
              id.includes('recharts') ||
              id.includes('/d3-') ||
              id.includes('victory-vendor')
            ) {
              return 'charts'
            }
            return 'vendor'
          }
        },
      },
    },
  },
})
