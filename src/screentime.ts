// The headline metric: how long the screen was on during the walk.
// Counts time the page is visible; a locked phone or a backgrounded app counts as "off".
export class ScreenTimer {
  private onSince: number | null = null;
  private total = 0;
  private glances = 0;
  private startedAt = 0;

  private onChange = () => {
    if (document.visibilityState === 'visible') this.on();
    else this.off();
  };

  start() {
    this.startedAt = Date.now();
    this.total = 0;
    this.glances = 0;
    this.onSince = document.visibilityState === 'visible' ? Date.now() : null;
    document.addEventListener('visibilitychange', this.onChange);
  }

  /** Call when the walker taps "I'm walking": the first setup seconds don't count as a glance. */
  resetGlances() {
    this.glances = 0;
  }

  stop() {
    this.off();
    document.removeEventListener('visibilitychange', this.onChange);
    return { screenOnMs: this.total, walkMs: Date.now() - this.startedAt, glances: this.glances };
  }

  private on() {
    if (this.onSince == null) {
      this.onSince = Date.now();
      this.glances++;
    }
  }

  private off() {
    if (this.onSince != null) {
      this.total += Date.now() - this.onSince;
      this.onSince = null;
    }
  }
}
