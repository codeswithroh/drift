// Kokoro (open-weight TTS) renders the whole drift ahead of time into ONE audio file:
// chime + instruction + silence, repeated. Phones keep playing audio with the screen
// locked, while timers and background GPS in a PWA get suspended. One file = no wake-ups.
import { KokoroTTS } from 'kokoro-js';
import type { Drift } from './drift';
import { hasWebGpu } from './gpu';
import type { Progress } from './llm';

const MODEL_ID = 'onnx-community/Kokoro-82M-v1.0-ONNX';
const OUT_RATE = 16000; // speech is fine at 16 kHz and it keeps a 45-minute file around 85 MB

let tts: KokoroTTS | null = null;

export async function loadTts(onProgress: Progress) {
  if (tts) return;
  const webgpu = await hasWebGpu();
  tts = await KokoroTTS.from_pretrained(MODEL_ID, {
    dtype: webgpu ? 'fp32' : 'q8',
    device: webgpu ? 'webgpu' : 'wasm',
    progress_callback: (p: { status: string; progress?: number }) => {
      if (p.status === 'progress' && p.progress != null) onProgress('Getting the voice ready…', p.progress / 100);
    },
  });
}

export interface RenderedDrift {
  url: string;
  /** Start time (s) of each step in the file, for the progress view. */
  marks: number[];
  durationSeconds: number;
}

export async function renderDrift(drift: Drift, onProgress: Progress): Promise<RenderedDrift> {
  if (!tts) throw new Error('TTS not loaded');
  const chunks: Float32Array[] = [];
  const marks: number[] = [];
  let length = 0;
  const push = (c: Float32Array) => {
    chunks.push(c);
    length += c.length;
  };

  for (const [i, step] of drift.steps.entries()) {
    onProgress(`Recording step ${i + 1} of ${drift.steps.length}…`, i / drift.steps.length);
    marks.push(length / OUT_RATE);
    const raw = await tts.generate(step.say, { voice: 'af_heart', speed: 0.95 });
    if (i > 0) push(chime());
    push(resample(toMono(raw.audio), raw.sampling_rate, OUT_RATE));
    push(new Float32Array(Math.round(step.walkSeconds * OUT_RATE)));
  }

  const pcm = new Float32Array(length);
  let offset = 0;
  for (const c of chunks) {
    pcm.set(c, offset);
    offset += c.length;
  }
  return {
    url: URL.createObjectURL(encodeWav(pcm, OUT_RATE)),
    marks,
    durationSeconds: length / OUT_RATE,
  };
}

function toMono(audio: Float32Array | Float32Array[]): Float32Array {
  if (!Array.isArray(audio)) return audio;
  const out = new Float32Array(audio.reduce((n, a) => n + a.length, 0));
  let o = 0;
  for (const a of audio) {
    out.set(a, o);
    o += a.length;
  }
  return out;
}

function resample(input: Float32Array, from: number, to: number): Float32Array {
  if (from === to) return input;
  const ratio = from / to;
  const out = new Float32Array(Math.floor(input.length / ratio));
  for (let i = 0; i < out.length; i++) {
    const x = i * ratio;
    const j = Math.floor(x);
    const f = x - j;
    out[i] = input[j] * (1 - f) + (input[j + 1] ?? input[j]) * f;
  }
  return out;
}

/** A soft two-note bell so you notice a new instruction without looking. */
function chime(): Float32Array {
  const dur = 0.9;
  const out = new Float32Array(Math.round((dur + 0.4) * OUT_RATE));
  for (const [freq, start] of [
    [880, 0],
    [1320, 0.18],
  ]) {
    for (let i = 0; i < dur * OUT_RATE; i++) {
      const t = i / OUT_RATE;
      out[Math.round(start * OUT_RATE) + i] += 0.18 * Math.sin(2 * Math.PI * freq * t) * Math.exp(-4 * t);
    }
  }
  return out;
}

function encodeWav(pcm: Float32Array, rate: number): Blob {
  const buf = new ArrayBuffer(44 + pcm.length * 2);
  const v = new DataView(buf);
  const str = (o: number, s: string) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  str(0, 'RIFF');
  v.setUint32(4, 36 + pcm.length * 2, true);
  str(8, 'WAVE');
  str(12, 'fmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true); // PCM
  v.setUint16(22, 1, true); // mono
  v.setUint32(24, rate, true);
  v.setUint32(28, rate * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  str(36, 'data');
  v.setUint32(40, pcm.length * 2, true);
  for (let i = 0; i < pcm.length; i++) {
    const s = Math.max(-1, Math.min(1, pcm[i]));
    v.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return new Blob([buf], { type: 'audio/wav' });
}
