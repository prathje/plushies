import {chromium, type Browser, type Page} from 'playwright';
import {join} from 'path';
import {serveDir} from './serve';

export const ROOT = join(import.meta.dir, '../..');

/**
 * A static server over the repo root (dist/, _site/, node_modules/three) and
 * a browser per page: SwiftShader Chromium has wedged after a few WebGL-heavy
 * pages (the cursor demo mounts three plushies at once), and in a shared
 * browser every test after that hung to its timeout. A fresh browser per
 * test costs a second and keeps one crash to one test.
 */
export async function launch() {
  const server = serveDir(ROOT);
  let browser: Browser | undefined;
  const fresh = async () => {
    await browser?.close().catch(() => {});
    // WebGL through SwiftShader: works headless on CI machines without a GPU.
    browser = await chromium.launch({args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader']});
    return browser;
  };
  return {
    url: (path: string) => new URL(path, server.url).href,
    async page(path: string, viewport = {width: 1280, height: 900}) {
      const page = await (await fresh()).newPage({viewport});
      // SwiftShader WebGL is slow on busy machines: generous waits instead of flakes.
      page.setDefaultTimeout(60_000);
      page.setDefaultNavigationTimeout(90_000);
      const errors: string[] = [];
      page.on('pageerror', e => errors.push(String(e)));
      page.on('console', m => m.type() === 'error' && errors.push(m.text()));
      // Fonts come from Google; don't let a slow font CDN fail a test.
      await page.route(/fonts\.(googleapis|gstatic)\.com/, route => route.abort());
      await page.goto(new URL(path, server.url).href, {waitUntil: 'domcontentloaded'});
      return {page, errors: () => errors.filter(e => !/fonts\.(googleapis|gstatic)|ERR_FAILED/.test(e))};
    },
    async close() {
      await browser?.close().catch(() => {});
      server.stop(true);
    },
  };
}

/** A fur-covered plushie is a busy image; an empty canvas compresses to almost nothing. */
export async function drawnBytes(page: Page, selector: string) {
  const png = await page.locator(selector).first().screenshot();
  return png.length;
}
