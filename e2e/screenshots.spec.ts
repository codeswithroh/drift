// Captures README / post screenshots by driving the real app (real models), light + dark.
// Run: SHOTS=1 npx playwright test screenshots
import { expect, test, type Page } from '@playwright/test';

test.skip(!process.env.SHOTS, 'set SHOTS=1 to capture docs screenshots');

const OUT = 'docs/screens';

async function shoot(page: Page, name: string) {
  await page.evaluate(() => scrollTo(0, 0));
  await page.waitForTimeout(500); // let the screen's fade-in finish
  for (const scheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: scheme });
    await page.screenshot({ path: `${OUT}/${name}-${scheme}.png` });
  }
  await page.emulateMedia({ colorScheme: 'light' });
}

async function setScreen(page: Page, state: 'visible' | 'hidden') {
  await page.evaluate((s) => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => s });
    document.dispatchEvent(new Event('visibilitychange'));
  }, state);
}

test('capture screens', async ({ page }) => {
  // Lets the walk "take" its real length without waiting 30 minutes: only Date.now moves.
  await page.addInitScript(() => {
    const real = Date.now.bind(Date);
    (window as any).__skip = 0;
    Date.now = () => real() + (window as any).__skip;
  });
  const skip = (ms: number) => page.evaluate((m) => ((window as any).__skip += m), ms);

  await page.goto('/');
  await page.getByRole('button', { name: '30 min' }).click();
  await page.getByRole('button', { name: 'old things', exact: true }).click();
  await shoot(page, '1-home');

  await page.getByRole('button', { name: 'Prepare my drift' }).click();
  await expect(page.locator('#msg')).toHaveText(/Gemma is writing/, { timeout: 12 * 60_000 });
  await shoot(page, '2-preparing');

  await expect(page.getByText('Your drift', { exact: true })).toBeVisible({ timeout: 12 * 60_000 });
  await shoot(page, '3-ready');

  await page.getByRole('button', { name: 'Start walking' }).click();
  const player = page.locator('#player');
  await expect.poll(() => player.evaluate((a: HTMLAudioElement) => a.readyState)).toBeGreaterThanOrEqual(1);
  await player.evaluate((a: HTMLAudioElement) => (a.currentTime = a.duration * 0.4));
  await expect(page.locator('#where')).toContainText(/Rule \d+ of \d+/);
  await page.screenshot({ path: `${OUT}/4-walking.png` });

  // A 31-minute walk: pocketed, one 40-second glance in the middle.
  await setScreen(page, 'hidden');
  await skip(14 * 60_000);
  await setScreen(page, 'visible');
  await skip(40_000);
  await setScreen(page, 'hidden');
  await skip(16 * 60_000);
  // Same screen as the audio ending; headless media won't always fire `ended` after a seek.
  await page.getByRole('button', { name: 'End drift early' }).click();
  await expect(page.getByText('Screen on during your walk')).toBeVisible();
  await setScreen(page, 'visible');
  await shoot(page, '5-stats');

  await page.getByRole('button', { name: 'Start talking' }).click();
  await page.waitForTimeout(11_000);
  await page.getByRole('button', { name: 'Done' }).click();
  await expect(page.locator('#msg')).toHaveText(/Listening back|Writing/, { timeout: 5 * 60_000 });
  await expect(page.locator('article.entry')).toBeVisible({ timeout: 8 * 60_000 });
  await shoot(page, '6-entry');

  await page.getByRole('button', { name: 'Done' }).click();
  await page.getByRole('button', { name: /Field notebook/ }).click();
  await shoot(page, '7-notebook');
});
