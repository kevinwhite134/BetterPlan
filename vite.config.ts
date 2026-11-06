import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'
import { createPhotoHandler } from './server/photoCoordinates.ts'
import { PHOTO_ENDPOINT } from './src/photoUpload.ts'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // These values remain in Node's middleware; never inject them into client code.
  const env = loadEnv(mode, process.cwd(), '')
  const photo = createPhotoHandler({ apiKey: process.env.OPENAI_API_KEY ?? env.OPENAI_API_KEY, model: process.env.OPENAI_VISION_MODEL ?? env.OPENAI_VISION_MODEL })
  const middleware: import('vite').Connect.NextHandleFunction = (req, res, next) => {
    if (req.url?.split('?')[0] === PHOTO_ENDPOINT) void photo(req, res)
    else next()
  }
  return {
    plugins: [react(), {
      name: 'photo-coordinates-api',
      configureServer(server) { server.middlewares.use(middleware) },
      configurePreviewServer(server) { server.middlewares.use(middleware) },
    }],
    // PDF exporters load on demand; prepare them before the first button click
    // so development dependency discovery does not reload an in-progress deck.
    optimizeDeps: { include: ['pdf-lib'] },
  }
})
