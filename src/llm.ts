// Gemma, running on the device.
// Primary path: MediaPipe LLM Inference (WebGPU) with Gemma 4 E2B (web build, ~2 GB,
// streamed from Hugging Face once, then cached on the device).
// Dev fallback: a local Ollama server, so the drift generator can be iterated on a laptop.
import { FilesetResolver, LlmInference } from '@mediapipe/tasks-genai';

const MODEL_URL =
  import.meta.env.VITE_GEMMA_MODEL_URL ??
  'https://huggingface.co/litert-community/gemma-4-E2B-it-litert-lm/resolve/main/gemma-4-E2B-it-web.litertlm';
const OLLAMA_URL = import.meta.env.VITE_OLLAMA_URL ?? 'http://localhost:11434';
const OLLAMA_MODEL = import.meta.env.VITE_OLLAMA_MODEL ?? 'gemma3n:e2b';
const WASM_URL = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-genai@0.10.29/wasm';
const CACHE = 'drift-models';

export type Backend = 'gemma-web' | 'ollama';
export type Progress = (msg: string, fraction?: number) => void;

let llm: LlmInference | null = null;
let backend: Backend | null = null;

export function activeBackend() {
  return backend;
}

/** Download (once) into the Cache API so the model is available offline afterwards. */
async function cachedModel(onProgress: Progress): Promise<ReadableStreamDefaultReader> {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(MODEL_URL);
  if (hit?.body) {
    onProgress('Loading Gemma from this device…');
    return hit.body.getReader();
  }

  const res = await fetch(MODEL_URL);
  if (!res.ok || !res.body) throw new Error(`Gemma model not found at ${MODEL_URL}`);
  const total = Number(res.headers.get('content-length')) || 0;
  let loaded = 0;
  const counted = res.body.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, ctrl) {
        loaded += chunk.byteLength;
        if (total) onProgress('Downloading Gemma (one time)…', loaded / total);
        ctrl.enqueue(chunk);
      },
    }),
  );
  // Tee: one branch is stored, the other goes straight into the model.
  const [toCache, toModel] = counted.tee();
  cache.put(MODEL_URL, new Response(toCache, { headers: res.headers })).catch(console.warn);
  return toModel.getReader();
}

async function ollamaAvailable(): Promise<boolean> {
  try {
    const r = await fetch(`${OLLAMA_URL}/api/tags`, { signal: AbortSignal.timeout(800) });
    return r.ok;
  } catch {
    return false;
  }
}

export async function loadLlm(onProgress: Progress): Promise<Backend> {
  if (backend) return backend;

  if ('gpu' in navigator) {
    try {
      const genai = await FilesetResolver.forGenAiTasks(WASM_URL);
      llm = await LlmInference.createFromOptions(genai, {
        baseOptions: { modelAssetBuffer: await cachedModel(onProgress) },
        maxTokens: 2048,
        topK: 40,
        temperature: 0.9,
      });
      return (backend = 'gemma-web');
    } catch (err) {
      console.warn('Gemma (web) unavailable, trying Ollama', err);
    }
  }

  if (await ollamaAvailable()) return (backend = 'ollama');
  throw new Error(
    'No Gemma backend: this browser has no WebGPU and no local Ollama was found (see README).',
  );
}

export async function generate(prompt: string): Promise<string> {
  if (!backend) throw new Error('LLM not loaded');
  if (backend === 'gemma-web') {
    // Gemma 3n needs explicit turn markers; the Gemma 4 .litertlm bundle carries its own template.
    // TODO: confirm on first browser run that Gemma 4 output is clean without manual markers.
    const query = MODEL_URL.includes('gemma-3n')
      ? `<start_of_turn>user\n${prompt}<end_of_turn>\n<start_of_turn>model\n`
      : prompt;
    return llm!.generateResponse(query);
  }
  const r = await fetch(`${OLLAMA_URL}/api/generate`, {
    method: 'POST',
    body: JSON.stringify({ model: OLLAMA_MODEL, prompt, stream: false, options: { temperature: 0.9 } }),
  });
  return (await r.json()).response as string;
}

/** Pull the first JSON object/array out of a model reply (models like to add prose/fences). */
export function extractJson<T>(text: string): T {
  const start = text.search(/[[{]/);
  const end = Math.max(text.lastIndexOf('}'), text.lastIndexOf(']'));
  if (start < 0 || end < start) throw new Error('No JSON in model output');
  return JSON.parse(text.slice(start, end + 1)) as T;
}
