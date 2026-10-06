// Pip the hedgehog. A vanilla port of page-mascot (MIT, Kamran Ahmed, github.com/nilbuild/page-mascot):
// two 3x3 sprite sheets, nine head directions and nine expressions. Pip watches the pointer
// (or wherever you tap), reacts when poked, and can hold a mood for a whole screen.

const DIRECTIONS = ['up-left', 'up', 'up-right', 'left', 'center', 'right', 'down-left', 'down', 'down-right'] as const;
const REACTIONS = ['blink', 'heart', 'sparkle', 'surprised', 'starry', 'bashful', 'sleepy', 'dizzy', 'delighted'] as const;

export type Direction = (typeof DIRECTIONS)[number];
export type Reaction = (typeof REACTIONS)[number];

// Clockwise from the right, matching atan2 with y pointing down.
const CLOCKWISE: Direction[] = ['right', 'down-right', 'down', 'down-left', 'left', 'up-left', 'up', 'up-right'];
const SECTOR = (Math.PI * 2) / CLOCKWISE.length;
const HYSTERESIS = 0.12;
const DEAD_ZONE = 70;
const PAYOFFS: Reaction[] = ['heart', 'sparkle', 'delighted'];
const SQUASH: Keyframe[] = [
  { transform: 'scale(1, 1)', easing: 'ease-in' },
  { transform: 'scale(1.10, 0.86)', offset: 0.18, easing: 'ease-out' },
  { transform: 'scale(0.95, 1.08)', offset: 0.45, easing: 'ease-in-out' },
  { transform: 'scale(1.03, 0.97)', offset: 0.72, easing: 'ease-in-out' },
  { transform: 'scale(1, 1)' },
];

const SHEETS = { directions: '/mascot/pip-directions.webp', reactions: '/mascot/pip-reactions.webp' };

const cell = (i: number) => `${(i % 3) * 50}% ${Math.floor(i / 3) * 50}%`;
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

const live = new Set<Pip>();
let pointer: { x: number; y: number } | null = null;

function aimAll() {
  for (const pip of live) {
    if (!pip.el.isConnected) live.delete(pip);
    else pip.aim();
  }
}
addEventListener('pointermove', (e) => {
  if (e.pointerType !== 'mouse') return;
  pointer = { x: e.clientX, y: e.clientY };
  aimAll();
}, { passive: true });
// On touch there is no hover: Pip looks at whatever you just tapped.
addEventListener('pointerdown', (e) => {
  pointer = { x: e.clientX, y: e.clientY };
  aimAll();
}, { passive: true });
addEventListener('scroll', aimAll, { passive: true });

export interface PipOptions {
  size?: number;
  /** Hold this expression until changed (e.g. sleepy while walking). */
  mood?: Reaction | null;
  /** Glance around on its own, for waiting screens. */
  wander?: boolean;
}

export class Pip {
  readonly el: HTMLButtonElement;
  private dirLayer: HTMLSpanElement;
  private reactLayer: HTMLSpanElement;
  private squash: HTMLSpanElement;
  private sector = -1;
  private mood: Reaction | null;
  private timers: number[] = [];
  private wanderTimer = 0;
  private boops = { count: 0, at: 0 };

  constructor({ size = 140, mood = null, wander = false }: PipOptions = {}) {
    this.mood = mood;
    this.el = document.createElement('button');
    this.el.type = 'button';
    this.el.className = 'pip';
    this.el.style.setProperty('--pip', `${size}px`);
    this.el.setAttribute('aria-label', 'Boop Pip the hedgehog');
    this.el.innerHTML = `<span class="pip-squash"><span class="pip-layer"></span><span class="pip-layer"></span></span>`;
    this.squash = this.el.firstElementChild as HTMLSpanElement;
    [this.dirLayer, this.reactLayer] = Array.from(this.squash.children) as HTMLSpanElement[];
    this.dirLayer.style.backgroundImage = `url(${SHEETS.directions})`;
    // Always present so the sheet is fetched up front, never on the first poke.
    this.reactLayer.style.backgroundImage = `url(${SHEETS.reactions})`;
    this.look('center');
    this.show(mood);
    this.el.addEventListener('click', () => this.boop());
    live.add(this);
    if (wander) this.wander();
  }

  /** Mount into a container (replacing a placeholder with [data-pip]). */
  mount(target: Element) {
    target.replaceWith(this.el);
    this.aim();
    return this;
  }

  look(d: Direction) {
    this.dirLayer.style.backgroundPosition = cell(DIRECTIONS.indexOf(d));
  }

  setMood(r: Reaction | null) {
    this.mood = r;
    this.show(r);
  }

  /** A short reaction, then back to the held mood. */
  react(r: Reaction, ms = 900, bounce = true) {
    this.clear();
    this.show(r);
    this.later(ms, this.mood);
    if (bounce) this.bounce();
  }

  get held() {
    return this.mood;
  }

  aim() {
    if (!pointer || this.wanderTimer) return;
    const box = this.el.getBoundingClientRect();
    const dx = pointer.x - (box.left + box.width / 2);
    const dy = pointer.y - (box.top + box.height / 2);
    if (Math.hypot(dx, dy) < DEAD_ZONE) {
      this.sector = -1;
      return this.look('center');
    }
    // Hold the current sector until the pointer is well past its edge.
    const angle = Math.atan2(dy, dx);
    if (this.sector !== -1 && Math.abs(wrap(angle - this.sector * SECTOR)) < SECTOR / 2 + HYSTERESIS) return;
    this.sector = (Math.round(angle / SECTOR) + CLOCKWISE.length) % CLOCKWISE.length;
    this.look(CLOCKWISE[this.sector]);
  }

  private wander() {
    const glance = () => {
      if (!this.el.isConnected) return clearInterval(this.wanderTimer);
      const options: Direction[] = ['left', 'right', 'up-left', 'up-right', 'center', 'down-left', 'down-right'];
      this.look(options[Math.floor(Math.random() * options.length)]);
    };
    this.wanderTimer = window.setInterval(glance, 1400);
  }

  private boop() {
    this.clear();
    const now = Date.now();
    this.boops.count = now - this.boops.at < 1600 ? this.boops.count + 1 : 1;
    this.boops.at = now;
    if (this.boops.count >= 4) {
      this.boops.count = 0;
      this.show('dizzy');
      this.later(1100, this.mood);
    } else {
      this.show('blink');
      this.later(120, PAYOFFS[(this.boops.count - 1) % PAYOFFS.length]);
      this.later(560, this.mood);
    }
    this.bounce();
  }

  private bounce() {
    if (!reducedMotion()) this.squash.animate(SQUASH, { duration: 420, easing: 'linear' });
  }

  private show(r: Reaction | null) {
    this.dirLayer.style.opacity = r ? '0' : '1';
    this.reactLayer.style.opacity = r ? '1' : '0';
    this.reactLayer.style.backgroundPosition = cell(REACTIONS.indexOf(r ?? 'blink'));
  }

  private later(ms: number, r: Reaction | null) {
    this.timers.push(window.setTimeout(() => this.show(r), ms));
  }

  private clear() {
    this.timers.forEach(clearTimeout);
    this.timers = [];
  }
}

/** Pip blinks now and then on its own, so it never looks frozen. */
export function idleBlink(pip: Pip) {
  const tick = () => {
    if (!pip.el.isConnected) return;
    if (!pip.held) pip.react('blink', 140, false);
    setTimeout(tick, 3500 + Math.random() * 4000);
  };
  setTimeout(tick, 2500);
}
