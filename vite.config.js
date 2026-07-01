import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'
import { ucloudAuthPlugin } from './vite.ucloud-auth.js'
import { jwglPlugin } from './vite.jwgl.js'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    ucloudAuthPlugin(),
    jwglPlugin(),
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
      '/jwgl': {
        target: 'https://jwgl.bupt.edu.cn',
        changeOrigin: true,
        secure: true,
        rewrite: (path) => path.replace(/^\/jwgl/, ''),
        headers: {
          Origin: 'https://jwgl.bupt.edu.cn',
          Referer: 'https://jwgl.bupt.edu.cn/',
        },
      },
      '/office': {
        target: 'https://ucloud.bupt.edu.cn',
        changeOrigin: true,
        rewrite: (path) => path,
        headers: {
          'Origin': 'https://ucloud.bupt.edu.cn',
          'Referer': 'https://ucloud.bupt.edu.cn/',
        },
        configure: (proxy) => {
          proxy.on('proxyReq', (proxyReq) => {
            // OfficeWeb365 匿名即可渲染，业务鉴权头反而会被下游存储拒绝
            proxyReq.removeHeader('Authorization');
            proxyReq.removeHeader('Blade-Auth');
          });
        },
      },
    },
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    },
  },
})
