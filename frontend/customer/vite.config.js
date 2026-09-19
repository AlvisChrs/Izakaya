import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'


export default defineConfig({
  base: '/customer/',
  plugins: [react()],
  build: {
    outDir: '../../public/customer',
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:3000',
      '/socket.io': {
        target: 'http://localhost:3000',
        ws: true,
      },
    },
  },
})