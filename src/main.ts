import './style.css';
import { createDrift, type Drift, type Mood } from './drift';
import { activeBackend, loadLlm, type Progress } from './llm';
import { writeEntry, type Entry } from './notebook';
import { ScreenTimer } from './screentime';
import { addEntry, entries, memory } from './store';
import { loadStt, Recorder, transcribe } from './stt';
import { loadTts, renderDrift, type RenderedDrift } from './tts';

const app = document.querySelector<HTMLDivElement>('#app')!;
const MOODS: Mood[] = ['quiet', 'colors', 'old things', 'sounds', 'surprise me'];

let minutes = 30;
let mood: Mood = 'surprise me';

function view(html: string) {
  app.innerHTML = html;
}

const $ = <T extends HTMLElement>(sel: string) => app.querySelector<T>(sel)!;

function esc(s: string) {
  return s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

function fmtDuration(ms: number) {
  const s = Math.round(ms / 1000);
  return s < 60 ? `${s} sec` : `${Math.floor(s / 60)} min ${s % 60} sec`;
}

// ---------- 1. Home ----------
async function home() {
  const past = await entries();
  view(`
    <main class="home">
      <header>
        <h1>Drift</h1>
        <p class="lede">A walk with no destination. An AI picks the rules, a voice reads them, your phone stays in your pocket.</p>
      </header>

      <section>
        <h2>How long?</h2>
        <div class="chips" id="minutes">
          ${[15, 30, 45].map((m) => `<button data-v="${m}" class="${m === minutes ? 'on' : ''}">${m} min</button>`).join('')}
        </div>
      </section>

      <section>
        <h2>Mood</h2>
        <div class="chips" id="mood">
          ${MOODS.map((m) => `<button data-v="${m}" class="${m === mood ? 'on' : ''}">${m}</button>`).join('')}
        </div>
      </section>

      <button class="primary" id="go">Prepare my drift</button>
      <p class="fine">Everything runs on this phone. First time only: about 2.5 GB of models to download on Wi-Fi.</p>

      ${
        past.length
          ? `<button class="link" id="nb">Field notebook (${past.length})</button>`
          : ''
      }
    </main>`);

  for (const group of ['minutes', 'mood'] as const) {
    $(`#${group}`).addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest('button');
      if (!b) return;
      if (group === 'minutes') minutes = Number(b.dataset.v);
      else mood = b.dataset.v as Mood;
      home();
    });
  }
  $('#go').addEventListener('click', prepare);
  if (past.length) $('#nb').addEventListener('click', notebook);
}

// ---------- 2. Prepare (all the screen time happens here, before leaving) ----------
function progressView(): Progress {
  view(`
    <main class="center">
      <p id="msg">Waking up…</p>
      <div class="bar"><div id="fill"></div></div>
      <p class="fine">Keep this screen open. This is the only part that needs it.</p>
    </main>`);
  return (msg, fraction) => {
    $('#msg').textContent = msg;
    $<HTMLDivElement>('#fill').style.width = fraction == null ? '0' : `${Math.round(fraction * 100)}%`;
  };
}

async function prepare() {
  const progress = progressView();
  try {
    await loadLlm(progress);
    progress(`Gemma is writing your drift (${activeBackend()})…`);
    const drift = await createDrift(minutes, mood, await memory());
    await loadTts(progress);
    const audio = await renderDrift(drift, progress);
    ready(drift, audio);
  } catch (err) {
    failed(err);
  }
}

// ---------- 3. Ready → walking ----------
function ready(drift: Drift, rendered: RenderedDrift) {
  view(`
    <main class="center">
      <p class="eyebrow">Your drift</p>
      <h1 class="title">${esc(drift.title)}</h1>
      <p>${drift.steps.length - 2} rules · ${Math.round(rendered.durationSeconds / 60)} min</p>
      <ol class="checklist">
        <li>Put on headphones.</li>
        <li>Press start, then lock your phone.</li>
        <li>Don't look again until the voice says so.</li>
      </ol>
      <button class="primary" id="start">Start walking</button>
    </main>`);
  $('#start').addEventListener('click', () => walk(drift, rendered));
}

function walk(drift: Drift, rendered: RenderedDrift) {
  const audio = new Audio(rendered.url);
  const timer = new ScreenTimer();
  timer.start();

  if ('mediaSession' in navigator) {
    navigator.mediaSession.metadata = new MediaMetadata({ title: drift.title, artist: 'Drift' });
  }

  view(`
    <main class="pocket">
      <p class="big">Lock your phone now.</p>
      <p class="fine" id="where"></p>
      <button class="link" id="end">End drift early</button>
    </main>`);

  // Only updates while someone is looking, which is exactly when it is needed.
  const tick = setInterval(() => {
    const step = rendered.marks.filter((m) => m <= audio.currentTime).length;
    $('#where').textContent = `Rule ${Math.max(0, step - 1)} of ${drift.steps.length - 2}. Put it away.`;
  }, 1000);

  const finish = () => {
    clearInterval(tick);
    audio.pause();
    debrief(drift, timer.stop());
  };
  audio.addEventListener('ended', finish, { once: true });
  $('#end').addEventListener('click', finish);
  audio.play().catch(failed);
}

// ---------- 4. Debrief ----------
function debrief(drift: Drift, stats: ReturnType<ScreenTimer['stop']>) {
  const rec = new Recorder();
  view(`
    <main class="center">
      <p class="eyebrow">Screen on during your walk</p>
      <p class="stat">${fmtDuration(stats.screenOnMs)}</p>
      <p>out of ${fmtDuration(stats.walkMs)} · ${stats.glances} glance${stats.glances === 1 ? '' : 's'}</p>
      <p class="lede">What did you notice? Talk for a minute. Nothing leaves this phone.</p>
      <button class="primary" id="rec">Start talking</button>
      <button class="link" id="skip">Skip</button>
    </main>`);

  let recording = false;
  $('#rec').addEventListener('click', async () => {
    if (!recording) {
      await rec.start();
      recording = true;
      $('#rec').textContent = 'Done';
      return;
    }
    const blob = await rec.stop();
    const progress = progressView();
    try {
      await loadStt(progress);
      progress('Listening back…');
      const transcript = await transcribe(blob);
      progress('Writing your field notebook…');
      const entry = await writeEntry(drift, transcript, stats);
      await addEntry(entry);
      showEntry(entry);
    } catch (err) {
      failed(err);
    }
  });
  $('#skip').addEventListener('click', async () => {
    await addEntry({
      driftId: drift.id,
      title: drift.title,
      date: Date.now(),
      minutes: Math.round(stats.walkMs / 60000),
      screenOnMs: stats.screenOnMs,
      glances: stats.glances,
      transcript: '',
      note: '(no notes)',
      enjoyed: '',
    });
    home();
  });
}

// ---------- 5. Notebook ----------
function entryHtml(e: Entry) {
  return `
    <article class="entry">
      <p class="eyebrow">${new Date(e.date).toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })}</p>
      <h2>${esc(e.title)}</h2>
      <p class="meta">${e.minutes} min walked · screen on ${fmtDuration(e.screenOnMs)}</p>
      <p>${esc(e.note)}</p>
    </article>`;
}

function showEntry(e: Entry) {
  view(`<main>${entryHtml(e)}<button class="primary" id="home">Done</button></main>`);
  $('#home').addEventListener('click', home);
}

async function notebook() {
  const all = await entries();
  const screen = all.reduce((t, e) => t + e.screenOnMs, 0);
  const walked = all.reduce((t, e) => t + e.minutes, 0);
  view(`
    <main>
      <button class="link" id="back">← Back</button>
      <h1>Field notebook</h1>
      <p class="meta">${all.length} drifts · ${walked} min outside · ${fmtDuration(screen)} of screen</p>
      ${all.map(entryHtml).join('')}
    </main>`);
  $('#back').addEventListener('click', home);
}

function failed(err: unknown) {
  console.error(err);
  view(`
    <main class="center">
      <p class="eyebrow">Something went wrong</p>
      <p>${esc(String((err as Error)?.message ?? err))}</p>
      <button class="primary" id="home">Back</button>
    </main>`);
  $('#home').addEventListener('click', home);
}

home();
