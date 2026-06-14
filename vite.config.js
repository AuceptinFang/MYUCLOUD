import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'
import { ucloudAuthPlugin } from './vite.ucloud-auth.js'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    ucloudAuthPlugin(),
    vue(),
    vueDevTools(),
  ],
  server: {
    proxy: {
      '/ucloud': {
        target: 'https://apiucloud.bupt.edu.cn',
        changeOrigin: true,
        secure: true,
        rewrite: (path) => path.replace(/^\/ucloud/, ''),
      },
      '/file': {
        target: 'https://fileucloud.bupt.edu.cn',
        changeOrigin: true, // 解决 Host 跨域
        rewrite: (path) => path.replace(/^\/file/, ''),
        headers: {
          'Origin': 'https://ucloud.bupt.edu.cn',
          'Referer': 'https://ucloud.bupt.edu.cn/'
        },
        configure: (proxy) => {
          proxy.on('proxyReq', (proxyReq) => {
            proxyReq.removeHeader('Authorization');
          });
        }
      },
    },
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    },
  },
})
