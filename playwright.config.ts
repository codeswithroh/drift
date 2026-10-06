import { defineConfig } from '@playwright/test';
import path from 'node:path';

const mic = path.resolve('e2e/fixtures/debrief.wav');

export default defineConfig({
  testDir: 'e2e',
  // Real models: first run downloads Kokoro + Whisper, and Gemma runs for real (via Ollama here).
  timeout: 15 * 60_000,
  expect: { timeout: 30_000 },
  workers: 1,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://localhost:5173',
    viewport: { width: 390, height: 844 },
    permissions: ['microphone'],
    trace: 'retain-on-failure',
    screenshot: 'on',
    launchOptions: {
      args: [
        '--use-fake-ui-for-media-stream',
        '--use-fake-device-for-media-stream',
        `--use-file-for-fake-audio-capture=${mic}`,
        '--autoplay-policy=no-user-gesture-required',
      ],
    },
  },
  webServer: {
    command: 'npm run dev -- --port 5173 --strictPort',
    url: 'http://localhost:5173',
    reuseExistingServer: true,
  },
});
