// After the walk: the spoken debrief becomes a field-notebook entry, and a line of memory
// that shapes the next drift.
import type { Drift } from './drift';
import { extractJson, generate } from './llm';

export interface Entry {
  driftId: string;
  title: string;
  date: number;
  minutes: number;
  screenOnMs: number;
  glances: number;
  transcript: string;
  note: string;
  enjoyed: string;
}

export async function writeEntry(
  drift: Drift,
  transcript: string,
  stats: { screenOnMs: number; walkMs: number; glances: number },
): Promise<Entry> {
  const rules = drift.steps.slice(1, -1).map((s, i) => `${i + 1}. ${s.say}`).join('\n');
  let note = transcript;
  let enjoyed = '';
  try {
    const out = extractJson<{ note: string; enjoyed: string }>(
      await generate(`You keep a naturalist's field notebook for a walker who just finished a drift (a rule-based walk).

The drift was called "${drift.title}". Its rules were:
${rules}

What the walker said afterwards (transcribed speech, may contain errors):
"""${transcript}"""

Write:
- "note": a field-notebook entry, 60-120 words, first person, present tense, concrete and sensory. Rewrite it in your own words, the way a naturalist would log it, and connect it to the rules of the drift. Do not copy the walker's sentences. Do not invent sights the walker did not mention.
- "enjoyed": one sentence on what kind of rule or moment this walker seemed to enjoy, to shape their next drift.

Reply with JSON only: {"note": "...", "enjoyed": "..."}`),
    );
    note = out.note?.trim() || note;
    enjoyed = out.enjoyed?.trim() || '';
  } catch (err) {
    console.warn('Notebook generation failed, keeping raw transcript', err);
  }

  return {
    driftId: drift.id,
    title: drift.title,
    date: Date.now(),
    minutes: Math.round(stats.walkMs / 60000),
    screenOnMs: stats.screenOnMs,
    glances: stats.glances,
    transcript,
    note,
    enjoyed,
  };
}
