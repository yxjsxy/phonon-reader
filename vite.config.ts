import { defineConfig } from 'vite';

// CPU threads in phonon-tts need a cross-origin isolated page. Hugging Face
// responds to CORS, so these headers do not block the checkpoint download.
const isolation = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
};

export default defineConfig({
  worker: {
    format: 'es',
  },
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    headers: isolation,
  },
  preview: {
    host: '127.0.0.1',
    port: 4173,
    strictPort: true,
    headers: isolation,
  },
  optimizeDeps: {
    exclude: ['phonon-tts'],
  },
});
