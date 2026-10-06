// Hand-drawn ink doodles. Strokes use currentColor; `fill` slots take a spot colour.
const paths: Record<string, string> = {
  leaf: '<path class="fill" d="M9 39C8 21 21 9 39 9c1 17-11 30-30 30Z"/><path d="M9 39C8 21 21 9 39 9c1 17-11 30-30 30Z"/><path d="M10 38 27 21m-7 1 1 7m4-11 1 6"/>',
  sparkle: '<path class="fill" d="M24 5c1.5 10 5 13.5 15 15-10 1.5-13.5 5-15 15-1.5-10-5-13.5-15-15 10-1.5 13.5-5 15-15Z"/><path d="M24 5c1.5 10 5 13.5 15 15-10 1.5-13.5 5-15 15-1.5-10-5-13.5-15-15 10-1.5 13.5-5 15-15Z"/>',
  squiggle: '<path d="M4 30c5-11 9 7 15-3s9-11 13-3 8 5 12-3"/>',
  loop: '<path d="M5 33c8 0 10-18 19-18 7 0 7 10 0 10s-6-14 4-16 13 9 15 13"/>',
  sun: '<circle class="fill" cx="24" cy="24" r="8"/><circle cx="24" cy="24" r="8"/><path d="M24 6v5m0 26v5M6 24h5m26 0h5M11 11l3.5 3.5m19 19L37 37M37 11l-3.5 3.5m-19 19L11 37"/>',
  cloud: '<path class="fill" d="M12 35h25a7 7 0 0 0 1-14 11 11 0 0 0-21-4 9 9 0 0 0-5 18Z"/><path d="M12 35h25a7 7 0 0 0 1-14 11 11 0 0 0-21-4 9 9 0 0 0-5 18Z"/>',
  heart: '<path class="fill" d="M24 39S8 29 8 18.5a8 8 0 0 1 16-3 8 8 0 0 1 16 3C40 29 24 39 24 39Z"/><path d="M24 39S8 29 8 18.5a8 8 0 0 1 16-3 8 8 0 0 1 16 3C40 29 24 39 24 39Z"/>',
  flower: '<circle class="fill" cx="24" cy="18" r="4"/><path d="M24 22v20m0-8c-5 0-8-3-9-7 5 0 8 3 9 7Zm0-2c4-1 7-4 7-8-4 1-7 4-7 8ZM24 10c3-4 7-3 7 1s-4 6-7 7c-3-1-7-3-7-7s4-5 7-1Z"/>',
  dots: '<circle cx="10" cy="14" r="1.6"/><circle cx="30" cy="8" r="1.6"/><circle cx="38" cy="30" r="1.6"/><circle cx="16" cy="36" r="1.6"/>',
  // Mood icons
  quiet: '<path class="fill" d="M31 7a16 16 0 1 0 10 29A14 14 0 0 1 31 7Z"/><path d="M31 7a16 16 0 1 0 10 29A14 14 0 0 1 31 7Z"/><path d="M38 9v5m-2.5-2.5h5"/>',
  colors: '<path class="fill" d="M24 7c10 0 18 7 18 15 0 6-5 8-9 7-3-1-5 1-4 4 1 4-2 7-6 7-10 0-16-8-16-17S14 7 24 7Z"/><path d="M24 7c10 0 18 7 18 15 0 6-5 8-9 7-3-1-5 1-4 4 1 4-2 7-6 7-10 0-16-8-16-17S14 7 24 7Z"/><circle cx="16" cy="20" r="2.4"/><circle cx="24" cy="14" r="2.4"/><circle cx="32" cy="17" r="2.4"/>',
  'old things': '<circle class="fill" cx="15" cy="17" r="8"/><circle cx="15" cy="17" r="8"/><circle cx="15" cy="17" r="3"/><path d="M21 23 39 41m-7-7 4-4m-1 9 4-4"/>',
  sounds: '<path d="M8 22v4m7-11v18m7-24v30m7-21v12m7-17v22m7-14v6"/>',
  'surprise me': '<path class="fill" d="M24 5c1.5 10 5 13.5 15 15-10 1.5-13.5 5-15 15-1.5-10-5-13.5-15-15 10-1.5 13.5-5 15-15Z"/><path d="M24 5c1.5 10 5 13.5 15 15-10 1.5-13.5 5-15 15-1.5-10-5-13.5-15-15 10-1.5 13.5-5 15-15Z"/><path d="M39 33c.5 3 2 4.5 5 5-3 .5-4.5 2-5 5-.5-3-2-4.5-5-5 3-.5 4.5-2 5-5Z"/>',
  // UI icons
  headphones: '<path d="M9 30v-6a15 15 0 0 1 30 0v6"/><rect class="fill" x="7" y="28" width="8" height="12" rx="3"/><rect x="7" y="28" width="8" height="12" rx="3"/><rect class="fill" x="33" y="28" width="8" height="12" rx="3"/><rect x="33" y="28" width="8" height="12" rx="3"/>',
  lock: '<rect class="fill" x="11" y="21" width="26" height="19" rx="4"/><rect x="11" y="21" width="26" height="19" rx="4"/><path d="M16 21v-5a8 8 0 0 1 16 0v5m-8 8v4"/>',
  ear: '<path d="M16 30c-2-3-3-6-3-10a11 11 0 0 1 22 0c0 6-5 8-6 12-1 5-4 8-8 8-3 0-5-2-5-4"/><path d="M19 20a5 5 0 0 1 10 0c0 3-3 4-3 6"/>',
  mic: '<rect class="fill" x="17" y="6" width="14" height="22" rx="7"/><rect x="17" y="6" width="14" height="22" rx="7"/><path d="M11 22a13 13 0 0 0 26 0M24 35v7m-6 0h12"/>',
  arrow: '<path d="M8 24h32m-11-11 11 11-11 11"/>',
  back: '<path d="M40 24H8m11-11L8 24l11 11"/>',
  check: '<path d="M10 25l9 9 19-20"/>',
  book: '<path class="fill" d="M8 10c6-2 11-1 16 3 5-4 10-5 16-3v27c-6-2-11-1-16 3-5-4-10-5-16-3Z"/><path d="M8 10c6-2 11-1 16 3 5-4 10-5 16-3v27c-6-2-11-1-16 3-5-4-10-5-16-3Zm16 3v27"/>',
};

export type Doodle = keyof typeof paths | string;

export function doodle(name: Doodle, cls = '') {
  return `<svg class="doodle ${cls}" viewBox="0 0 48 48" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">${paths[name] ?? ''}</svg>`;
}
