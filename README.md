# Drift

A walk with no destination. An open-weight AI writes the rules, an open-weight voice reads them, and your phone stays in your pocket.

Built for the [DEV Hacktoberfest Open-Source AI Challenge, Week 1: Touch Grass](https://dev.to/challenges/hacktoberfest-week1-2026-10-05). Project started October 6, 2026.

## How it works

1. **Prepare (the only screen time).** Pick a length and a mood. **Gemma 4 E2B** writes a *dérive*: a sequence of sensory rules ("follow the next red thing until you lose it").
2. **Render.** **Kokoro-82M** speaks each rule, and the app stitches chime + voice + silence into **one audio file**. A locked phone keeps playing audio, while a PWA's timers and background GPS get suspended, so one file means the walk needs no wake-ups, no signal and no GPS.
3. **Walk.** Lock the phone. The app counts every second the screen is on.
4. **Debrief.** Talk for a minute. **Whisper** transcribes on the device, and Gemma turns it into a field-notebook entry plus one line of memory that shapes your next drift.

Nothing leaves the phone. No account, no API key, no server.

| Piece | Open model / library | Runs |
|---|---|---|
| Drift + notebook writer | Gemma 4 E2B via MediaPipe LLM Inference | WebGPU, in the browser |
| Voice | Kokoro-82M via `kokoro-js` | WebGPU / WASM |
| Listener | Whisper base via `transformers.js` | WebGPU / WASM |

## Run it

```bash
npm install
npm run dev
```

### Gemma model

Nothing to download by hand. On first run the app streams [Gemma 4 E2B (web build, about 2 GB)](https://huggingface.co/litert-community/gemma-4-E2B-it-litert-lm) from Hugging Face into the browser's Cache API. After that, drifts work offline. To self-host the file, set `VITE_GEMMA_MODEL_URL`.

**Laptop dev fallback:** without WebGPU, the app uses a local [Ollama](https://ollama.com) server:

```bash
ollama pull gemma3n:e2b
```

Set `VITE_OLLAMA_MODEL` in `.env.local` to use a different local Gemma (for example `gemma3:4b`).

## Tests

End-to-end tests drive the real app with real models in headless Chromium (Playwright): Gemma via local Ollama, Kokoro and Whisper in the page, and a fake microphone that plays recorded speech.

```bash
ollama pull gemma3n:e2b   # or set VITE_OLLAMA_MODEL
npm run test:e2e
```

They cover the full drift (prepare → walk with the screen locked → spoken debrief → notebook, persisted across reloads), fallback rules when the model returns junk, ending early and skipping the debrief, and a clear error when no Gemma backend exists.

## Code map

- `src/llm.ts`: Gemma loading (MediaPipe + Cache API, with Ollama fallback)
- `src/drift.ts`: the dérive prompt, validation, and a fallback rule set
- `src/tts.ts`: Kokoro rendering into one WAV with chimes and silences
- `src/stt.ts`: recording and Whisper transcription
- `src/screentime.ts`: the screen-on counter
- `src/notebook.ts`: debrief → field-notebook entry + memory
- `src/main.ts`: UI

## Known limits / TODO

- Audio is 16 kHz WAV (about 1.9 MB per minute). Encoding to Opus would cut that roughly 20x.
- Screen time is measured with the Page Visibility API, so it only counts while Drift is the foreground app.
