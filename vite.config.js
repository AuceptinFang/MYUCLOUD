import { fileURLToPath, URL } from 'node:url'

import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'
import { backendPlugin } from './vite.backend.js'
import { normalizeBackendOrigin } from './src/utils/backend-url.js'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_')
  const backendOrigin = normalizeBackendOrigin(env.VITE_BACKEND_URL ?? (mode === 'pages' ? 'https://u.pub.aucept.in' : ''))
  return {
    define: { 'import.meta.env.VITE_BACKEND_URL': JSON.stringify(backendOrigin) },
    base: mode === 'pages' ? './' : '/',
    publicDir: mode === 'pages' ? false : 'public',
    plugins: [
      ...(mode === 'pages' ? [] : [backendPlugin()]),
      vue(),
      ...(mode === 'pages' ? [] : [vueDevTools()]),
    ],
    server: {
      cors: false,
      fs: {
        deny: ['.env', '.env.*', '*.{crt,pem,key,p12,pfx,cer,der}', '.npmrc', '.yarnrc.yml', '**/.git/**', '**/.jwgl-sessions*.local'],
      },
      watch: { ignored: ['**/.jwgl-sessions*.local'] },
    },
    preview: { cors: false },
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url))
      },
    },
  }
})
