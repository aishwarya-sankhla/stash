import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { viteSingleFile } from 'vite-plugin-singlefile'

export default defineConfig({
  // Single-file build: everything (JS, CSS, fonts) is inlined into dist/index.html so it runs offline from file://
  plugins: [react(), viteSingleFile()],
  server: { host: '0.0.0.0', allowedHosts: true },
})
