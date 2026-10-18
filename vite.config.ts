import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { viteSingleFile } from 'vite-plugin-singlefile'

// Built app only (Stash.html and the desktop app): the page may not load or send anything over the network.
// Scripts and styles are inlined by the single-file build; confetti runs in a blob: worker.
const CSP = [
  "default-src 'none'",
  "script-src 'unsafe-inline'",
  "style-src 'unsafe-inline'",
  'worker-src blob:',
  'font-src data:',
  'img-src data:',
  "connect-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join('; ')

const contentSecurityPolicy: Plugin = {
  name: 'stash-csp',
  apply: 'build',
  transformIndexHtml: (html) => html.replace('<head>', `<head>\n    <meta http-equiv="Content-Security-Policy" content="${CSP}" />`),
}

export default defineConfig({
  // Single-file build: everything (JS, CSS, fonts) is inlined into dist/index.html so it runs offline from file://
  plugins: [react(), viteSingleFile(), contentSecurityPolicy],
  server: { host: '0.0.0.0', allowedHosts: true },
})
