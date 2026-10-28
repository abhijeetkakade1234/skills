import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: { rollupOptions: { output: { manualChunks(id) {
    // postfx first: it is lazy-loaded on desktop only (scene/Effects.tsx)
    if (id.includes('/node_modules/postprocessing/') || id.includes('/node_modules/@react-three/postprocessing/') || id.includes('/node_modules/n8ao/')) return 'postfx-vendor'
    if (id.includes('/node_modules/three/') || id.includes('/node_modules/@react-three/')) return 'graphics-vendor'
  } } } },
})
