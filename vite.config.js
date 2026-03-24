import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// Serve files from map_analysis/ at /maps/ URL path
function mapAnalysisPlugin() {
  return {
    name: 'map-analysis-server',
    configureServer(server) {
      server.middlewares.use('/maps', (req, res, next) => {
        const fileName = decodeURIComponent(req.url.replace(/^\//, ''))
        const filePath = path.join(__dirname, 'map_analysis', fileName)
        if (fs.existsSync(filePath)) {
          const ext = path.extname(filePath).toLowerCase()
          const contentTypes = {
            '.pdf':     'application/pdf',
            '.png':     'image/png',
            '.jpg':     'image/jpeg',
            '.geojson': 'application/geo+json',
            '.json':    'application/json',
          }
          res.setHeader('Content-Type', contentTypes[ext] || 'application/octet-stream')
          res.setHeader('Cache-Control', 'no-cache')   // always fresh for review files
          fs.createReadStream(filePath).pipe(res)
        } else {
          next()
        }
      })
    },
  }
}

export default defineConfig({
  plugins: [react(), tailwindcss(), mapAnalysisPlugin()],
  optimizeDeps: {
    include: ['pdfjs-dist'],
  },
  server: {
    port: 5180,
    proxy: {
      '/api': 'http://localhost:3001',
    },
  },
})
