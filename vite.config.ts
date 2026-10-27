import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // These exporters load on demand; prepare them before the first button click
  // so development dependency discovery does not reload an in-progress deck.
  optimizeDeps: { include: ['exceljs', 'pdf-lib'] },
})
