import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'

const raiz = import.meta.dirname

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      input: {
        // "/" es la presentación (estática); la app vive en "/app".
        presentacion: resolve(raiz, 'index.html'),
        app: resolve(raiz, 'app/index.html'),
      },
    },
  },
})
