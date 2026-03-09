/// <reference types="vitest" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

function getNodeModulePackageName(id: string): string | null {
  const [, modulePath] = id.split(/node_modules[\\/]/).slice(-2)
  if (!modulePath) {
    return null
  }

  const segments = modulePath.split(/[\\/]/).filter(Boolean)
  if (segments.length === 0) {
    return null
  }

  if (segments[0].startsWith('@') && segments.length > 1) {
    return `${segments[0]}/${segments[1]}`
  }

  return segments[0]
}

const reactPackages = new Set(['react', 'react-dom', 'react-router', 'react-router-dom', 'scheduler'])
const echartsPackages = new Set(['echarts', 'echarts-for-react', 'zrender'])

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) {
            return undefined
          }

          const packageName = getNodeModulePackageName(id)
          if (!packageName) {
            return undefined
          }

          if (reactPackages.has(packageName)) {
            return 'react-vendor'
          }

          if (echartsPackages.has(packageName)) {
            return 'echarts-vendor'
          }

          if (
            packageName === 'antd' ||
            packageName.startsWith('@ant-design/') ||
            packageName.startsWith('@rc-component/') ||
            packageName.startsWith('rc-')
          ) {
            return 'ui-vendor'
          }

          return undefined
        },
      },
    },
  },
  server: {
    host: '127.0.0.1',
    port: 3001,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:3100',
        changeOrigin: true,
      },
      '/data-service': {
        target: 'http://127.0.0.1:8001',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/data-service/, ''),
      },
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
    css: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'src/test/',
        '**/*.d.ts',
        '**/*.config.*',
        '**/dist/**',
        '**/mockData/**',
      ],
    },
  },
})
