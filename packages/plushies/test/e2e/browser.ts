import {chromium, type Browser, type Page} from 'playwright';
import {join} from 'path';
import {serveDir} from './serve';

export const ROOT = join(import.meta.dir, '../..');

/**
 * Run a test body again if it fails, up to `tries` times, each attempt within
 * `seconds`: SwiftShader Chromium on the CI runner wedges now and then (every
 * call then hangs to its own timeout, and a long test wears through its whole
 * budget without ever failing), and a fresh browser on the next try usually
 * does. The deadline is what makes the next try happen in time; the body's
 * next `browser.page()` tears the wedged browser down. Bun's own `retry`
 * option is a no-op as of 1.3. Size the test's timeout for tries × seconds.
 */
export const attempts = (body: () => Promise<void>, tries = 3, seconds = 90) => async () => {
  for (let n = 1; ; n++) {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const run = body();
      // The abandoned attempt rejects later, against a browser that is gone: not an unhandled rejection.
      run.catch(() => {});
      await Promise.race([run, new Promise<never>((_, reject) => (timer = setTimeout(() => reject(new Error(`attempt took longer than ${seconds} s`)), seconds * 1000)))]);
      return;
    } catch (error) {
      if (n >= tries) throw error;
      console.warn(`[e2e] try ${n + 1} after: ${String(error).split('\n')[0]}`);
    } finally {
      clearTimeout(timer);
    }
  }
};

/**
 * Give a page's evaluate() a deadline: Playwright waits on an in-page promise
 * with no timeout, so a wedged renderer (it happens on the CI runner) would
 * hang a test past its budget and past its second try.
 */
export function withDeadline(page: Page, seconds = 60) {
  const evaluate = page.evaluate.bind(page);
  page.evaluate = ((fn: unknown, arg?: unknown) =>
    Promise.race([
      evaluate(fn as never, arg),
      new Promise((_, reject) => setTimeout(() => reject(new Error(`evaluate: no answer from the page in ${seconds} s`)), seconds * 1000)),
    ])) as typeof page.evaluate;
  return page;
}

/** A Chromium that can be killed: its close() may never return on a wedged SwiftShader browser. */
export interface Chromium {
  browser: Browser;
  /** close(), or after five seconds SIGKILL by pid. */
  stop(): Promise<void>;
}

/**
 * Launch Chromium with WebGL through SwiftShader (works headless on CI
 * machines without a GPU), noting its pid so a wedged one can be killed:
 * on the CI runner a browser's close() has hung forever, and everything
 * waiting on it hung to its timeout without a word.
 */
export async function launchChromium(): Promise<Chromium> {
  const options = {
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-dev-shm-usage'],
    timeout: 30_000,
    // On CI, Chromium's own stderr goes to the log: a GPU process that crashed or was killed says so there.
    ...(process.env.CI ? {env: {...process.env, DEBUG: 'pw:browser'}} : {}),
  };
  // A launch right after a browser went down has failed to connect on the runner: give it a second try.
  const browser = await chromium.launch(options).catch(async error => {
    console.warn(`[e2e] Chromium did not launch (${String(error).split('\n')[0]}); trying again`);
    await new Promise(r => setTimeout(r, 2_000));
    return chromium.launch(options);
  });
  let pid: number | undefined;
  try {
    const cdp = await browser.newBrowserCDPSession();
    const {processInfo} = (await cdp.send('SystemInfo.getProcessInfo')) as {processInfo: {type: string; id: number}[]};
    pid = processInfo.find(p => p.type === 'browser')?.id;
    await cdp.detach().catch(() => {});
  } catch {
    /* no pid: close() will have to do */
  }
  return {
    browser,
    async stop() {
      const closed = await Promise.race([browser.close().then(() => true, () => true), new Promise<false>(r => setTimeout(() => r(false), 5_000))]);
      if (closed) return;
      // Wedged. Its children (GPU, renderers) outlive a SIGKILL to the browser
      // alone and would starve the next launch: take down every SwiftShader
      // Chromium (ours are the only ones).
      console.warn(`[e2e] Chromium close() hung; killing it${pid ? ` (pid ${pid})` : ''}`);
      try {
        if (pid) process.kill(pid, 'SIGKILL');
      } catch {
        /* already gone */
      }
      Bun.spawnSync(['pkill', '-KILL', '-f', '--', '--use-angle=swiftshader']);
      await new Promise(r => setTimeout(r, 1_000));
    },
  };
}

/**
 * A static server over the repo root (dist/, _site/, node_modules/three) and
 * a browser per page: SwiftShader Chromium has wedged after a few WebGL-heavy
 * pages (the cursor demo mounts three plushies at once), and in a shared
 * browser every test after that hung to its timeout. A fresh browser per
 * test costs a second and keeps one crash to one test.
 */
export async function launch() {
  const server = serveDir(ROOT);
  let chrome: Chromium | undefined;
  const stop = async () => {
    const c = chrome;
    chrome = undefined;
    await c?.stop();
  };
  const fresh = async () => {
    await stop();
    chrome = await launchChromium();
    return chrome.browser;
  };
  return {
    url: (path: string) => new URL(path, server.url).href,
    async page(path: string, viewport = {width: 1280, height: 900}) {
      const page = withDeadline(await (await fresh()).newPage({viewport}));
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
      await stop();
      server.stop(true);
    },
  };
}

/** A fur-covered plushie is a busy image; an empty canvas compresses to almost nothing. */
export async function drawnBytes(page: Page, selector: string) {
  const png = await page.locator(selector).first().screenshot();
  return png.length;
}
