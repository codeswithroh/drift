import { expect, test, type Page } from '@playwright/test';

/** Pretend the phone was locked / unlocked: the Page Visibility API is all the app sees. */
async function setScreen(page: Page, state: 'visible' | 'hidden') {
  await page.evaluate((s) => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => s });
    document.dispatchEvent(new Event('visibilitychange'));
  }, state);
}

async function notebookFromDb(page: Page) {
  return page.evaluate(
    () =>
      new Promise<any[]>((resolve, reject) => {
        const open = indexedDB.open('keyval-store');
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const get = open.result.transaction('keyval').objectStore('keyval').get('drift:notebook');
          get.onsuccess = () => resolve(get.result ?? []);
        };
      }),
  );
}

async function prepareDrift(page: Page, minutes: string, mood: string) {
  await page.goto('/');
  await page.getByRole('button', { name: minutes }).click();
  await page.getByRole('button', { name: mood, exact: true }).click();
  await expect(page.getByRole('button', { name: minutes })).toHaveClass(/on/);
  await expect(page.getByRole('button', { name: mood, exact: true })).toHaveClass(/on/);
  await page.getByRole('button', { name: 'Prepare my drift' }).click();
  await expect(page.locator('.bar')).toBeVisible();
  await expect(page.getByText('Your drift', { exact: true })).toBeVisible({ timeout: 12 * 60_000 });
}

test('full drift: prepare → walk with screen off → spoken debrief → notebook', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));

  // 1. Prepare: Gemma writes the rules, Kokoro renders them.
  await prepareDrift(page, '15 min', 'colors');
  const title = (await page.locator('h1.title').textContent())!.trim();
  expect(title.length).toBeGreaterThan(2);
  expect(title).not.toBe('An unplanned walk'); // that is the fallback: Gemma output was unusable
  const meta = await page.locator('main p').nth(1).textContent();
  const rules = Number(meta!.match(/(\d+) rules/)![1]);
  expect(rules).toBeGreaterThanOrEqual(3);
  await page.screenshot({ path: 'test-results/01-ready.png' });

  // 2. Walk.
  await page.getByRole('button', { name: 'Start walking' }).click();
  await expect(page.getByText('Lock your phone now.')).toBeVisible();
  const player = page.locator('#player');
  await expect.poll(() => player.evaluate((a: HTMLAudioElement) => a.readyState)).toBeGreaterThanOrEqual(1);

  // The single rendered file should be about as long as the walk promised (15 min + speech).
  const duration = await player.evaluate((a: HTMLAudioElement) => a.duration);
  expect(duration).toBeGreaterThan(14 * 60);
  expect(duration).toBeLessThan(18 * 60);
  await expect.poll(() => player.evaluate((a: HTMLAudioElement) => !a.paused)).toBe(true);
  await expect(page.locator('#where')).toHaveText('Starting. Put it away.');

  // Lock the phone, glance once for ~2 s, lock again.
  await setScreen(page, 'hidden');
  await page.waitForTimeout(1500);
  await setScreen(page, 'visible');
  await page.waitForTimeout(2000);
  await setScreen(page, 'hidden');

  // Fast-forward to the end of the audio: the app must move to the debrief by itself.
  // (Headless Chromium has no audio clock, so seek exactly to the end to get `ended`.)
  await player.evaluate((a: HTMLAudioElement) => (a.currentTime = a.duration - 120));
  await expect(page.locator('#where')).toContainText(/Rule \d+ of \d+|Almost done/);
  const where = await page.locator('#where').textContent();
  const [, n, of] = where!.match(/Rule (\d+) of (\d+)/) ?? [, '0', '1'];
  expect(Number(n)).toBeLessThanOrEqual(Number(of));
  await player.evaluate((a: HTMLAudioElement) => (a.currentTime = a.duration));
  await expect(page.getByText('Screen on during your walk')).toBeVisible({ timeout: 10_000 });
  // Taking the phone out after the voice says "the end" must not count as a glance.
  await setScreen(page, 'visible');
  await expect(page.getByText(/1 glance\b/)).toBeVisible();
  const stat = await page.locator('.stat').textContent();
  expect(stat).toMatch(/^\d+ sec$/);
  expect(Number(stat!.split(' ')[0])).toBeLessThan(10);
  await page.screenshot({ path: 'test-results/02-stats.png' });

  // 3. Debrief: the fake mic plays real speech; Whisper + Gemma turn it into a notebook entry.
  await page.getByRole('button', { name: 'Start talking' }).click();
  await expect(page.getByRole('button', { name: 'Done' })).toBeVisible();
  await page.waitForTimeout(11_000);
  await page.getByRole('button', { name: 'Done' }).click();
  await expect(page.locator('article.entry')).toBeVisible({ timeout: 8 * 60_000 });
  await expect(page.locator('article.entry h2')).toHaveText(title);
  await page.screenshot({ path: 'test-results/03-entry.png' });

  const [entry] = await notebookFromDb(page);
  expect(entry.transcript).toMatch(/bicycle|bakery|tree/i);
  expect(entry.note.length).toBeGreaterThan(40);
  expect(entry.note).not.toBe(entry.transcript); // Gemma rewrote it
  expect(entry.enjoyed.length).toBeGreaterThan(5);
  expect(entry.glances).toBe(1);

  // 4. Notebook persists across reloads.
  await page.getByRole('button', { name: 'Done' }).click();
  await page.reload();
  await page.getByRole('button', { name: /Field notebook \(1\)/ }).click();
  await expect(page.getByRole('heading', { name: 'Field notebook' })).toBeVisible();
  await expect(page.locator('article.entry')).toHaveCount(1);
  await expect(page.getByText(/1 drift · \d+ min outside/)).toBeVisible();
  await page.screenshot({ path: 'test-results/04-notebook.png' });

  expect(errors).toEqual([]);
});

test('unusable model output still produces a walk (fallback rules)', async ({ page }) => {
  await page.route('**/api/generate', (r) =>
    r.fulfill({ contentType: 'application/json', body: JSON.stringify({ response: 'sorry, I cannot help with that' }) }),
  );
  await prepareDrift(page, '15 min', 'quiet');
  await expect(page.locator('h1.title')).toHaveText('An unplanned walk');
  await expect(page.getByText(/6 rules/)).toBeVisible();
});

test('end early and skip the debrief', async ({ page }) => {
  await page.route('**/api/generate', (r) =>
    r.fulfill({ contentType: 'application/json', body: JSON.stringify({ response: 'nope' }) }),
  );
  await prepareDrift(page, '15 min', 'sounds');
  await page.getByRole('button', { name: 'Start walking' }).click();
  await page.getByRole('button', { name: 'End drift early' }).click();
  await expect(page.getByText('Screen on during your walk')).toBeVisible();
  await page.getByRole('button', { name: 'Skip' }).click();
  await expect(page.getByRole('button', { name: /Field notebook \(1\)/ })).toBeVisible();
});

test('no Gemma backend shows a clear error and recovers', async ({ page }) => {
  await page.route('**/api/tags', (r) => r.abort());
  await page.goto('/');
  await page.getByRole('button', { name: 'Prepare my drift' }).click();
  await expect(page.getByText('Something went wrong')).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText(/No Gemma backend/)).toBeVisible();
  await page.getByRole('button', { name: 'Back' }).click();
  await expect(page.getByRole('button', { name: 'Prepare my drift' })).toBeVisible();
});

test('a silent debrief is rejected instead of saved as Whisper\'s "Thank you."', async ({ page }) => {
  await page.goto('/');
  const result = await page.evaluate(async () => {
    const stt = await import('/src/stt.ts' as string);
    await stt.loadStt(() => {});
    // 3 s of near-silence (faint noise), encoded as a WAV, like a mic that captured nothing.
    const rate = 16000, n = rate * 3;
    const buf = new ArrayBuffer(44 + n * 2), v = new DataView(buf);
    const str = (o: number, s: string) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
    str(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); str(8, 'WAVE'); str(12, 'fmt '); v.setUint32(16, 16, true);
    v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true);
    v.setUint16(32, 2, true); v.setUint16(34, 16, true); str(36, 'data'); v.setUint32(40, n * 2, true);
    for (let i = 0; i < n; i++) v.setInt16(44 + i * 2, Math.round((Math.random() - 0.5) * 40), true);
    return {
      transcript: await stt.transcribe(new Blob([buf], { type: 'audio/wav' })),
      shortIsSilent: stt.isSilent(new Float32Array(8000)),
      speechIsSilent: stt.isSilent(Float32Array.from({ length: 32000 }, (_, i) => 0.2 * Math.sin(i / 8))),
    };
  });
  expect(result.transcript).toBe('');
  expect(result.shortIsSilent).toBe(true);
  expect(result.speechIsSilent).toBe(false);
});
