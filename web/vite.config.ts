import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  server: {
    host: '0.0.0.0',
    port: 3000,
    allowedHosts: true,
    proxy: {
      '/api': {
        target: 'http://localhost:3001', // 代理到你的后端服务
        changeOrigin: true,
        rewrite: path => path.replace(/^\/api/, '/api')
      }
    }
  }
})