// Renders docs/hero.png (README banner) and docs/cover.png (DEV cover, 1000x420) from docs/hero.html.
// Run after screenshots: SHOTS=1 npx playwright test hero
import { test } from '@playwright/test';
import path from 'node:path';

test.skip(!process.env.SHOTS, 'set SHOTS=1 to render docs images');

const page = (q: string) => `file://${path.resolve('docs/hero.html')}?${q}`;

test('hero + cover', async ({ browser }) => {
  for (const [file, w, h, vars, shots] of [
    ['hero', 1600, 800, '--copy:560px;--title:132px;--pw:250px;--pipsize:150px;--eye:15px;--lede:25px;--gap:56px;--pad:80px', '3-ready-light,4-walking,5-stats-light'],
    ['cover', 1000, 420, '--copy:430px;--title:84px;--pw:150px;--pipsize:92px;--eye:11px;--lede:17px;--gap:28px;--pad:48px', '4-walking,5-stats-light'],
  ] as const) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2 });
    const p = await ctx.newPage();
    await p.goto(page(`shots=${shots}`));
    await p.addStyleTag({ content: `:root{--w:${w}px;--h:${h}px;${vars}}` });
    await p.waitForLoadState('networkidle');
    await p.evaluate(() => document.fonts.ready);
    await p.screenshot({ path: `docs/${file}.png` });
    await ctx.close();
  }
});
