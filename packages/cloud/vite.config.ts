import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'

export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  publicDir: false,
  resolve: { dedupe: ['react', 'react-dom', '@lincyaw/kernel', '@lincyaw/design', '@lincyaw/workbench'] },
  build: {
    outDir: 'dist/web', emptyOutDir: true, sourcemap: true,
    rolldownOptions: {
      onLog(level, log, defaultHandler) {
        // This build is entirely browser-side. React Server Component boundaries are irrelevant here.
        if (log.code === 'MODULE_LEVEL_DIRECTIVE' && log.message.includes('use client')) return
        defaultHandler(level, log)
      },
    },
  },
  server: {
    host: '127.0.0.1',
    proxy: { '/api': { target: process.env.PRESMIUM_CLOUD_DEV_API || 'http://127.0.0.1:8787', changeOrigin: false, ws: true } },
  },
})
