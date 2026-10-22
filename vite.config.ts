import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode, command }) => ({
  plugins: [react(), {
    name: 'web-api-content-security-policy',
    transformIndexHtml(html) {
      if (mode !== 'web') return html;
      const connect = "connect-src 'self' https://api.openai.com https://api.anthropic.com https://generativelanguage.googleapis.com";
      return html.replace(/connect-src [^;]+;/, `${connect}${command === 'serve' ? ' ws://127.0.0.1:*' : ''};`);
    },
  }],
  base: './',
  server: { host: '127.0.0.1', port: 5173, strictPort: true },
  build: { outDir: mode === 'web' ? 'dist-web' : 'dist', emptyOutDir: true },
}));
