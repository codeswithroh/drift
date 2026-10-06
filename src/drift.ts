// The dérive: a walk steered by rules instead of a destination.
import { extractJson, generate } from './llm';

export type Mood = 'quiet' | 'colors' | 'old things' | 'sounds' | 'surprise me';

export interface Step {
  /** What the voice says. One or two short sentences, spoken. */
  say: string;
  /** Silence after the instruction, i.e. how long to walk with it. */
  walkSeconds: number;
}

export interface Drift {
  id: string;
  createdAt: number;
  minutes: number;
  mood: Mood;
  title: string;
  steps: Step[];
}

const INTRO =
  'Put your phone in your pocket. You will not need to look at it again. Listen, walk, and follow the rules.';
const OUTRO =
  'That is the end of the drift. Before you take your phone out, stand still for ten breaths. Then tell me what you noticed.';

function prompt(minutes: number, mood: Mood, memory: string) {
  return `You design "dérives": Situationist drifts, walks guided by playful rules instead of a destination.
Write a ${minutes}-minute drift with the mood "${mood}".

Rules for you:
- ${Math.max(4, Math.round(minutes / 5))} steps. Each step is ONE instruction, spoken aloud, max 25 words.
- The walker cannot look at a screen, map or GPS. Instructions must work in ANY place: a city, a suburb, a park.
- Use the senses and the surroundings. The style is like "turn toward the loudest sound" or "follow the next red thing", but invent your OWN rules; do not reuse these examples.
- Mix movement steps with pause steps (stand, listen, touch, count).
- Never say a duration or a number of seconds or minutes in "say"; the silence after each step handles timing.
- Be safe: never ask to enter private property, cross roads unsafely, or approach strangers.
- walkSeconds: how long to walk or linger after the instruction (60-420). The total should be about ${minutes * 60} seconds.
${memory ? `\nWhat this walker enjoyed before (lean into it, do not repeat it):\n${memory}\n` : ''}
Reply with JSON only:
{"title": "a short evocative title", "steps": [{"say": "...", "walkSeconds": 180}]}`;
}

// Used if the model returns something unusable, so a walk never fails to start.
const FALLBACK: Step[] = [
  { say: 'Walk toward the brightest patch of sky you can see.', walkSeconds: 240 },
  { say: 'At the next corner, turn toward whatever is loudest.', walkSeconds: 240 },
  { say: 'Stop. Close your eyes. Count five different sounds.', walkSeconds: 60 },
  { say: 'Follow the next red thing you see, until you lose it.', walkSeconds: 300 },
  { say: 'Find a tree older than you. Stand under it for one minute.', walkSeconds: 90 },
  { say: 'Take the path that looks least used.', walkSeconds: 300 },
];

export async function createDrift(minutes: number, mood: Mood, memory: string): Promise<Drift> {
  let title = 'An unplanned walk';
  let steps = FALLBACK;
  try {
    const out = extractJson<{ title?: string; steps?: Step[] }>(
      await generate(prompt(minutes, mood, memory)),
    );
    const clean = (out.steps ?? [])
      .filter((s) => typeof s.say === 'string' && s.say.trim())
      .map((s) => ({ say: s.say.trim(), walkSeconds: clamp(Number(s.walkSeconds) || 180, 45, 480) }));
    if (clean.length >= 3) {
      steps = scaleTo(clean, minutes * 60);
      title = out.title?.trim() || title;
    }
  } catch (err) {
    console.warn('Drift generation failed, using fallback', err);
  }

  return {
    id: crypto.randomUUID(),
    createdAt: Date.now(),
    minutes,
    mood,
    title,
    steps: [{ say: INTRO, walkSeconds: 8 }, ...steps, { say: OUTRO, walkSeconds: 2 }],
  };
}

function clamp(n: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, n));
}

/** Small models are bad at arithmetic: rescale the silences so the walk lasts as long as promised. */
function scaleTo(steps: Step[], targetSeconds: number): Step[] {
  const total = steps.reduce((t, s) => t + s.walkSeconds, 0);
  const k = targetSeconds / total;
  return steps.map((s) => ({ ...s, walkSeconds: Math.round(s.walkSeconds * k) }));
}
