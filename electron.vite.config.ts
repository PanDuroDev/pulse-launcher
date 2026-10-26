import path from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'

const root = process.cwd()
const rendererRoot = path.resolve(root, 'src/renderer')
const sharedAlias = { '@shared': path.resolve(root, 'src/shared') }

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: {
        ...sharedAlias,
        '@main': path.resolve(root, 'src/main'),
      },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: sharedAlias,
    },
  },
  renderer: {
    root: rendererRoot,
    resolve: {
      alias: {
        ...sharedAlias,
        '@': path.resolve(rendererRoot, 'src'),
      },
    },
    plugins: [react(), tailwindcss()],
    server: {
      port: 5173,
      strictPort: true,
    },
    build: {
      rollupOptions: {
        input: path.resolve(rendererRoot, 'index.html'),
      },
    },
  },
})
