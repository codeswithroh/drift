import '@fontsource-variable/fraunces';
import '@fontsource-variable/inter';
import './style.css';
import { doodle } from './doodles';
import { createDrift, type Drift, type Mood } from './drift';
import { activeBackend, loadLlm, modelStorageNote, type Progress } from './llm';
import { idleBlink, Pip, type Reaction } from './mascot';
import { writeEntry, type Entry } from './notebook';
import { ScreenTimer } from './screentime';
import { addEntry, entries, memory } from './store';
import { loadStt, Recorder, transcribe } from './stt';
import { loadTts, renderDrift, type RenderedDrift } from './tts';

const app = document.querySelector<HTMLDivElement>('#app')!;

const MOODS: { id: Mood; hint: string; tint: string }[] = [
  { id: 'quiet', hint: 'Softer streets, fewer people', tint: 'lav' },
  { id: 'colors', hint: 'Follow what catches your eye', tint: 'peach' },
  { id: 'old things', hint: 'Bricks, bark and rust', tint: 'sun' },
  { id: 'sounds', hint: 'Steer by ear', tint: 'sage' },
  { id: 'surprise me', hint: 'Let Gemma decide', tint: 'sun' },
];
const LENGTHS = [15, 30, 45, 60];

let minutes = 30;
let mood: Mood = 'surprise me';

function view(html: string, cls = '') {
  document.body.className = cls;
  app.innerHTML = html;
  app.querySelector('main')?.animate(
    [{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'none' }],
    { duration: 380, easing: 'cubic-bezier(.2,.7,.2,1)' },
  );
}

const $ = <T extends HTMLElement>(sel: string) => app.querySelector<T>(sel)!;

/** Put Pip where the template has <span data-pip></span>. */
function pip(opts: ConstructorParameters<typeof Pip>[0] = {}) {
  const p = new Pip(opts).mount($('[data-pip]'));
  if (!opts.mood && !opts.wander) idleBlink(p);
  return p;
}

function esc(s: string) {
  return s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

function fmtDuration(ms: number) {
  const s = Math.round(ms / 1000);
  return s < 60 ? `${s} sec` : `${Math.floor(s / 60)} min ${s % 60} sec`;
}

function greeting() {
  const h = new Date().getHours();
  return h < 5 ? 'Up late' : h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}

// ---------- 1. Home ----------
async function home() {
  const past = await entries();
  const walked = past.reduce((t, e) => t + e.minutes, 0);
  const screen = past.reduce((t, e) => t + e.screenOnMs, 0);
  const today = new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });

  view(`
    <main class="home">
      <section class="hero">
        <div class="doodles" aria-hidden="true">
          ${doodle('sparkle', 'd1 sun-fill')}${doodle('leaf', 'd2 sage-fill')}${doodle('cloud', 'd3 lav-fill')}
          ${doodle('squiggle', 'd4')}${doodle('heart', 'd5 peach-fill')}${doodle('flower', 'd6 sun-fill')}${doodle('loop', 'd7')}${doodle('dots', 'd8')}
        </div>
        <span data-pip></span>
        <p class="eyebrow">${greeting()} · ${today}</p>
        <h1 class="display">Let’s get <em>a little</em> lost.</h1>
        <p class="lede">Gemma writes the rules. A voice reads them. Your phone stays in your pocket.</p>
      </section>

      <section class="card">
        <div class="row"><h2>How long</h2><span class="value">${minutes} min</span></div>
        <div class="ruler" id="minutes" aria-label="Walk length">
          ${LENGTHS.map(
            (m, i) => `${i ? '<span class="ticks" aria-hidden="true"><i></i><i></i><i></i><i></i></span>' : ''}
            <button data-v="${m}" class="${m === minutes ? 'on' : ''}" aria-pressed="${m === minutes}" aria-label="${m} min"><b></b><span>${m}</span></button>`,
          ).join('')}
        </div>
      </section>

      <section>
        <h2 class="section-title">Pick a mood</h2>
        <div class="moods" id="mood" aria-label="Mood">
          ${MOODS.map(
            (m) => `<button data-v="${m.id}" class="mood ${m.id === mood ? 'on' : ''}" aria-pressed="${m.id === mood}" aria-label="${m.id}">
              <span class="icon ${m.tint}-fill">${doodle(m.id)}</span>
              <span class="name">${m.id}</span><span class="hint">${m.hint}</span>
            </button>`,
          ).join('')}
        </div>
      </section>

      <button class="cta" id="go">Prepare my drift ${doodle('arrow')}</button>
      <p class="fine center">Runs entirely on this phone · first time, about 2.5 GB on Wi-Fi</p>

      ${
        past.length
          ? `<button class="card notebook-link" id="nb">
              <span class="row"><span class="nb-title">${doodle('book', 'sage-fill')} Field notebook (${past.length})</span>${doodle('arrow', 'small')}</span>
              <span class="stats">
                <span><b>${past.length}</b> drift${past.length === 1 ? '' : 's'}</span>
                <span><b>${walked}</b> min outside</span>
                <span><b>${fmtDuration(screen)}</b> of screen</span>
              </span>
            </button>`
          : ''
      }
    </main>`);

  pip({ size: 132 });
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
interface Steps {
  progress: Progress;
  step(i: number): void;
}

function progressView(steps: string[], title: string): Steps {
  view(`
    <main class="center prepare">
      <div class="orb"><span data-pip></span></div>
      <p class="eyebrow">${title}</p>
      <p id="msg" class="msg">Waking up…</p>
      <div class="bar"><div id="fill"></div></div>
      <ol class="steps">${steps.map((s) => `<li>${doodle('check')}<span>${s}</span></li>`).join('')}</ol>
      <p class="fine">Keep this screen open. This is the only part that needs it.</p>
    </main>`);
  pip({ size: 112, wander: true });
  const items = app.querySelectorAll('.steps li');
  return {
    progress: (msg, fraction) => {
      $('#msg').textContent = msg;
      $<HTMLDivElement>('#fill').style.width = fraction == null ? '0' : `${Math.round(fraction * 100)}%`;
    },
    step: (i) =>
      items.forEach((li, j) => {
        li.classList.toggle('done', j < i);
        li.classList.toggle('now', j === i);
      }),
  };
}

async function prepare() {
  const { progress, step } = progressView(['Wake up Gemma', 'Write the rules', 'Find a voice', 'Record your walk'], 'Preparing your drift');
  try {
    step(0);
    await loadLlm(progress);
    step(1);
    progress(`Gemma is writing your drift (${activeBackend()})…`);
    const drift = await createDrift(minutes, mood, await memory());
    step(2);
    await loadTts(progress);
    step(3);
    const audio = await renderDrift(drift, progress);
    step(4);
    ready(drift, audio);
  } catch (err) {
    failed(err);
  }
}

// ---------- 3. Ready → walking ----------
function ready(drift: Drift, rendered: RenderedDrift) {
  view(`
    <main class="center ready">
      <span data-pip></span>
      <p class="eyebrow">Your drift</p>
      <h1 class="title">${esc(drift.title)}</h1>
      <p class="chips-row"><span>${drift.steps.length - 2} rules</span><span>${Math.round(rendered.durationSeconds / 60)} min</span><span>no signal needed</span></p>
      <ol class="checklist card">
        <li>${doodle('headphones', 'lav-fill')}<span>Put on headphones.</span></li>
        <li>${doodle('lock', 'sun-fill')}<span>Press start, then lock your phone.</span></li>
        <li>${doodle('ear')}<span>Don't look again until the voice says so.</span></li>
      </ol>
      <button class="cta" id="start">Start walking ${doodle('arrow')}</button>
      ${modelStorageNote() ? `<p class="fine">${esc(modelStorageNote()!)}</p>` : ''}
    </main>`);
  pip({ size: 120, mood: 'delighted' });
  $('#start').addEventListener('click', () => walk(drift, rendered));
}

function walk(drift: Drift, rendered: RenderedDrift) {
  const timer = new ScreenTimer();
  timer.start();

  if ('mediaSession' in navigator) {
    navigator.mediaSession.metadata = new MediaMetadata({ title: drift.title, artist: 'Drift' });
  }

  view(
    `
    <main class="pocket">
      <audio id="player" src="${rendered.url}" preload="auto"></audio>
      <div class="breath"><span data-pip></span></div>
      <p class="big">Lock your phone now.</p>
      <p class="fine" id="where"></p>
      <button class="link" id="end">End drift early</button>
    </main>`,
    'night',
  );
  pip({ size: 96, mood: 'sleepy' });

  const audio = $<HTMLAudioElement>('#player');

  // Only updates while someone is looking, which is exactly when it is needed.
  const tick = setInterval(() => {
    // marks include the intro (first) and outro (last) clips around the rules.
    const rules = drift.steps.length - 2;
    const rule = rendered.marks.filter((m) => m <= audio.currentTime).length - 1;
    $('#where').textContent =
      rule < 1 ? 'Starting. Put it away.' : rule > rules ? 'Almost done. Put it away.' : `Rule ${rule} of ${rules}. Put it away.`;
  }, 1000);

  let finished = false;
  const finish = () => {
    if (finished) return;
    finished = true;
    clearInterval(tick);
    audio.pause();
    debrief(drift, timer.stop());
  };
  audio.addEventListener('ended', finish, { once: true });
  $('#end').addEventListener('click', finish);
  audio.play().catch((err: DOMException) => {
    // Ending early interrupts a pending play(): that is not an error.
    if (!finished && err.name !== 'AbortError') failed(err);
  });
}

// ---------- 4. Debrief ----------
function verdict(share: number): { mood: Reaction; line: string } {
  if (share < 0.03) return { mood: 'starry', line: 'You barely looked. Pip is impressed.' };
  if (share < 0.1) return { mood: 'delighted', line: 'Mostly pocketed. Nice walk.' };
  if (share < 0.3) return { mood: 'bashful', line: 'A few peeks. That’s allowed.' };
  return { mood: 'surprised', line: 'Lots of screen. Try a shorter drift next time?' };
}

function debrief(drift: Drift, stats: ReturnType<ScreenTimer['stop']>) {
  const rec = new Recorder();
  const share = stats.walkMs ? stats.screenOnMs / stats.walkMs : 0;
  const v = verdict(share);
  const R = 54;
  const C = 2 * Math.PI * R;

  view(`
    <main class="center debrief">
      <p class="eyebrow">Screen on during your walk</p>
      <div class="ring">
        <svg viewBox="0 0 128 128" aria-hidden="true">
          <circle cx="64" cy="64" r="${R}" class="track"/>
          <circle cx="64" cy="64" r="${R}" class="used" stroke-dasharray="${Math.max(share * C, 2)} ${C}"/>
        </svg>
        <span data-pip></span>
      </div>
      <p class="stat">${fmtDuration(stats.screenOnMs)}</p>
      <p>out of ${fmtDuration(stats.walkMs)} · ${stats.glances} glance${stats.glances === 1 ? '' : 's'}</p>
      <p class="verdict">${v.line}</p>

      <section class="card talk">
        <h2>What did you notice?</h2>
        <p class="fine">Talk for a minute. Whisper listens on this phone; nothing is uploaded.</p>
        <button class="cta" id="rec">${doodle('mic', 'peach-fill')}<span>Start talking</span></button>
        <p class="fine timer" id="timer" hidden></p>
      </section>
      <button class="link" id="skip">Skip</button>
    </main>`);
  const p = pip({ size: 118, mood: v.mood });

  let recording = false;
  let clock = 0;
  $('#rec').addEventListener('click', async () => {
    if (!recording) {
      await rec.start();
      recording = true;
      p.setMood('surprised');
      $('#rec').classList.add('recording');
      $('#rec').querySelector('span')!.textContent = 'Done';
      const t0 = Date.now();
      const timerEl = $('#timer');
      timerEl.hidden = false;
      clock = window.setInterval(() => {
        const s = Math.round((Date.now() - t0) / 1000);
        timerEl.textContent = `Listening… ${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
      }, 250);
      return;
    }
    clearInterval(clock);
    const blob = await rec.stop();
    const { progress, step } = progressView(['Wake the listener', 'Listen back', 'Write your notebook'], 'Your field notebook');
    try {
      step(0);
      await loadStt(progress);
      step(1);
      progress('Listening back…');
      const transcript = await transcribe(blob);
      step(2);
      progress('Writing your field notebook…');
      const entry = await writeEntry(drift, transcript, stats);
      await addEntry(entry);
      showEntry(entry);
    } catch (err) {
      failed(err);
    }
  });
  $('#skip').addEventListener('click', async () => {
    clearInterval(clock);
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
      <p class="meta"><span>${e.minutes} min walked</span><span>screen on ${fmtDuration(e.screenOnMs)}</span></p>
      <p class="note">${esc(e.note)}</p>
      ${e.enjoyed ? `<p class="pip-note">${doodle('heart', 'peach-fill')}<span>${esc(e.enjoyed)}</span></p>` : ''}
    </article>`;
}

function showEntry(e: Entry) {
  view(`
    <main class="entry-view">
      <div class="entry-head"><span data-pip></span><p class="eyebrow">New in your field notebook</p></div>
      ${entryHtml(e)}
      <button class="cta" id="home">Done</button>
    </main>`);
  pip({ size: 72, mood: 'heart' });
  $('#home').addEventListener('click', home);
}

async function notebook() {
  const all = await entries();
  const screen = all.reduce((t, e) => t + e.screenOnMs, 0);
  const walked = all.reduce((t, e) => t + e.minutes, 0);
  view(`
    <main class="notebook">
      <button class="link back" id="back">${doodle('back', 'small')} Back</button>
      <div class="nb-head"><h1>Field notebook</h1><span data-pip></span></div>
      <p class="meta">${all.length} drift${all.length === 1 ? '' : 's'} · ${walked} min outside · ${fmtDuration(screen)} of screen</p>
      <div class="tiles">
        <div class="tile sage"><b>${all.length}</b><span>drift${all.length === 1 ? '' : 's'}</span></div>
        <div class="tile peach"><b>${walked}</b><span>min outside</span></div>
        <div class="tile lav"><b>${Math.round(screen / 1000)}</b><span>sec of screen</span></div>
      </div>
      ${all.map(entryHtml).join('')}
    </main>`);
  pip({ size: 72 });
  $('#back').addEventListener('click', home);
}

function failed(err: unknown) {
  console.error(err);
  view(`
    <main class="center">
      <span data-pip></span>
      <p class="eyebrow">Something went wrong</p>
      <p class="error">${esc(String((err as Error)?.message ?? err))}</p>
      <button class="cta" id="home">Back</button>
    </main>`);
  pip({ size: 110, mood: 'dizzy' });
  $('#home').addEventListener('click', home);
}

home();
