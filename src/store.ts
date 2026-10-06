import { get, set } from 'idb-keyval';
import type { Entry } from './notebook';

const KEY = 'drift:notebook';

export async function entries(): Promise<Entry[]> {
  return (await get<Entry[]>(KEY)) ?? [];
}

export async function addEntry(e: Entry) {
  await set(KEY, [e, ...(await entries())]);
}

/** The last few "enjoyed" lines, fed back into the next drift prompt. */
export async function memory(): Promise<string> {
  return (await entries())
    .slice(0, 5)
    .map((e) => e.enjoyed)
    .filter(Boolean)
    .map((s) => `- ${s}`)
    .join('\n');
}
