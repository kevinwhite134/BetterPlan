import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // PDF exporters load on demand; prepare them before the first button click
  // so development dependency discovery does not reload an in-progress deck.
  optimizeDeps: { include: ['pdf-lib'] },
})
