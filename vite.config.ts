import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  // MediaPipe/ONNX use SharedArrayBuffer-friendly WASM; keep them out of the dep optimizer.
  optimizeDeps: { exclude: ['@mediapipe/tasks-genai', '@huggingface/transformers', 'kokoro-js'] },
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'Drift',
        short_name: 'Drift',
        description: 'A walk with no destination. Your phone stays in your pocket.',
        theme_color: '#1f2a1f',
        background_color: '#f4f1e8',
        display: 'standalone',
        icons: [{ src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }],
      },
      workbox: {
        // App shell only. Model weights are cached at runtime by llm.ts / transformers.js.
        globPatterns: ['**/*.{js,css,html,svg,wasm,webp,woff2}'],
        maximumFileSizeToCacheInBytes: 30 * 1024 * 1024,
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/cdn\.jsdelivr\.net\/npm\/@mediapipe\//,
            handler: 'CacheFirst',
            options: { cacheName: 'mediapipe-wasm' },
          },
        ],
      },
    }),
  ],
});
