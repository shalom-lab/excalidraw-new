import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  base: '/excalidraw-new/',
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    // Fallback if browser→api.github.com CORS is blocked
    proxy: {
      '/api/github': {
        target: 'https://api.github.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/github/, ''),
        headers: {
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
        },
      },
      // Library CDN proxy (dev only; production CDNs already send ACAO: *)
      '/api/libraries': {
        target: 'https://libraries.excalidraw.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/libraries/, ''),
      },
      '/api/github-raw': {
        target: 'https://raw.githubusercontent.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/github-raw/, ''),
      },
    },
  },
})
