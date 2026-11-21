// Renders the key Scenes of a Show in the Visualiser and saves PNGs. Driven by
// `npm run show:shots` (scripts/show-shots.mjs) and by e2e/show-shots.test.ts.
//
// The real built app in `out/`. The Show and the venue open through the Open…
// buttons, with the native file dialog answered by the test. The Visualiser is
// Detached so its canvas stays on screen while Perform fires the Scenes. Camera
// FOH, Assume haze 40 %. Nothing is written but the PNGs.
import { _electron as electron, expect, type Page } from '@playwright/test';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { loadShowFile } from '../src/engine/show-file';
import { keyShots, shotFile, type ShotArgs } from '../scripts/make-shows/shots';

/** The haze the shots assume: the rubric's "about 40 %". */
const HAZE_PERCENT = 40;
/** Time for a fade to finish and an Effect to be under way, in ms. */
const SETTLE_MS = 3000;

export interface Shot {
  file: string;
  scenes: string[];
  /** Share of pixels clearly lit: 0 is a blank frame. */
  lit: number;
}

export async function takeShots(args: ShotArgs): Promise<Shot[]> {
  const show = loadShowFile(readFileSync(args.show, 'utf8'));
  const plan = keyShots(show);
  mkdirSync(args.out, { recursive: true });

  const userData = mkdtempSync(join(tmpdir(), 'lightcues-shots-'));
  const app = await electron.launch({
    args: [`--user-data-dir=${userData}`, '.'],
    env: inheritedEnv(),
  });
  try {
    const page = await app.firstWindow();
    const sidebar = page.getByRole('navigation', { name: 'Views' });
    const open = async (view: string, path: string) => {
      await app.evaluate(({ dialog }, file) => {
        dialog.showOpenDialog = () => Promise.resolve({ canceled: false, filePaths: [file] });
      }, resolve(path));
      await sidebar.getByRole('button', { name: view }).click();
      await page.getByRole('button', { name: 'Open…' }).click();
    };
    await open('Venue Patch', args.venue);
    await open('Show', args.show);

    await page.keyboard.press('Control+5');
    await page.getByRole('button', { name: 'Detach' }).click();
    const detached = await app.waitForEvent('window');
    const canvas = detached.locator('canvas');
    await expect(canvas).toBeVisible();
    await detached.getByRole('button', { name: 'FOH', exact: true }).click();
    await detached.getByRole('slider', { name: 'Assume haze' }).fill(String(HAZE_PERCENT));
    await expect(detached.getByText(`${HAZE_PERCENT}%`)).toBeVisible();

    await sidebar.getByRole('button', { name: 'Perform' }).click();
    const shots: Shot[] = [];
    for (const [index, step] of plan.entries()) {
      // A clean stage: clear every Layer that holds a Scene.
      for (const layer of show.layers) {
        const clear = page.getByRole('button', { name: `Clear ${layer.name}` });
        if (await clear.isEnabled()) await clear.click();
      }
      for (const name of step.scenes) {
        const button = page
          .getByRole('button')
          .filter({ has: page.getByText(name, { exact: true }) });
        await button.click();
        await expect(button).toHaveAttribute('aria-pressed', 'true');
      }
      await page.waitForTimeout(SETTLE_MS);
      const png = await canvas.screenshot();
      const file = join(args.out, shotFile(index, step.name));
      writeFileSync(file, png);
      shots.push({ file, scenes: step.scenes, lit: await litShare(page, png) });
    }
    return shots;
  } finally {
    await app.close();
    rmSync(userData, { recursive: true, force: true });
  }
}

// The share of pixels clearly lit (the empty stage and floor sit below 64). The page decodes the PNG, so no image
// library is needed.
async function litShare(page: Page, png: Buffer): Promise<number> {
  return page.evaluate(async (base64) => {
    const image = new Image();
    image.src = `data:image/png;base64,${base64}`;
    await image.decode();
    const copy = document.createElement('canvas');
    copy.width = image.width;
    copy.height = image.height;
    const context = copy.getContext('2d')!;
    context.drawImage(image, 0, 0);
    const { data } = context.getImageData(0, 0, copy.width, copy.height);
    let lit = 0;
    for (let i = 0; i < data.length; i += 4) {
      if (Math.max(data[i]!, data[i + 1]!, data[i + 2]!) > 64) lit++;
    }
    return lit / (data.length / 4);
  }, png.toString('base64'));
}

// This process's environment, without a dev server URL (the app loads the
// built renderer) and without ELECTRON_RUN_AS_NODE (it would run Electron as
// plain Node).
function inheritedEnv(): Record<string, string> {
  return Object.fromEntries(
    Object.entries(process.env).flatMap(([name, value]) =>
      value === undefined || name === 'ELECTRON_RENDERER_URL' || name === 'ELECTRON_RUN_AS_NODE'
        ? []
        : [[name, value]],
    ),
  );
}
