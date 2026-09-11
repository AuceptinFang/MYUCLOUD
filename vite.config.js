import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'
import { backendPlugin } from './vite.backend.js'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    backendPlugin(),
    vue(),
    vueDevTools(),
  ],
  server: {
    fs: {
      deny: ['.env', '.env.*', '*.{crt,pem,key,p12,pfx,cer,der}', '.npmrc', '.yarnrc.yml', '**/.git/**', '**/.jwgl-sessions*.local'],
    },
    watch: { ignored: ['**/.jwgl-sessions*.local'] },
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    },
  },
})
