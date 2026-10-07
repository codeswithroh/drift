// Whisper, on the device (transformers.js). The debrief never leaves the phone.
import { pipeline, type AutomaticSpeechRecognitionPipeline } from '@huggingface/transformers';
import { hasWebGpu } from './gpu';
import type { Progress } from './llm';

const MODEL_ID = 'onnx-community/whisper-base';
let asr: AutomaticSpeechRecognitionPipeline | null = null;

export async function loadStt(onProgress: Progress) {
  if (asr) return;
  asr = (await pipeline('automatic-speech-recognition', MODEL_ID, {
    device: (await hasWebGpu()) ? 'webgpu' : 'wasm',
    dtype: 'q8',
    progress_callback: (p: { status: string; progress?: number }) => {
      if (p.status === 'progress' && p.progress != null) onProgress('Getting the listener ready…', p.progress / 100);
    },
  })) as AutomaticSpeechRecognitionPipeline;
}

// What Whisper says when it hears silence or noise: it was trained on subtitles.
const HALLUCINATIONS = /^[\s.!?,]*(thank you|thanks|thanks for watching|thank you for watching|you|bye|okay|so|um+|uh+)?[\s.!?,]*$/i;

/** True when a recording is too short or too quiet to contain speech. */
export function isSilent(pcm: Float32Array, rate = 16000): boolean {
  if (pcm.length < rate * 1.5) return true;
  let sum = 0;
  for (let i = 0; i < pcm.length; i++) sum += pcm[i] * pcm[i];
  return Math.sqrt(sum / pcm.length) < 0.004;
}

/** Returns '' when nothing was said, instead of Whisper's "Thank you." */
export async function transcribe(audio: Blob): Promise<string> {
  if (!asr) throw new Error('STT not loaded');
  const ctx = new AudioContext({ sampleRate: 16000 });
  const decoded = await ctx.decodeAudioData(await audio.arrayBuffer());
  await ctx.close();
  const pcm = decoded.getChannelData(0);
  if (isSilent(pcm)) return '';
  const out = await asr(pcm, { chunk_length_s: 30, stride_length_s: 5 });
  const text = (Array.isArray(out) ? out.map((o) => o.text).join(' ') : out.text).trim();
  return HALLUCINATIONS.test(text) ? '' : text;
}

export class Recorder {
  private rec?: MediaRecorder;
  private parts: Blob[] = [];

  async start() {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    this.parts = [];
    this.rec = new MediaRecorder(stream);
    this.rec.ondataavailable = (e) => this.parts.push(e.data);
    this.rec.start();
  }

  stop(): Promise<Blob> {
    return new Promise((resolve) => {
      const rec = this.rec!;
      rec.onstop = () => {
        rec.stream.getTracks().forEach((t) => t.stop());
        resolve(new Blob(this.parts, { type: rec.mimeType }));
      };
      rec.stop();
    });
  }
}
