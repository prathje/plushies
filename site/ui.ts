export const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Expose a plushie colour to CSS: --plush and its hue --plush-h (stages tint themselves with it). */
export function plushVars(node: HTMLElement, color: string) {
  node.style.setProperty('--plush', color);
  const m = /^#?([0-9a-f]{6})$/i.exec(color);
  if (!m) return;
  const [r, g, b] = [0, 2, 4].map(i => parseInt(m[1].slice(i, i + 2), 16) / 255);
  const max = Math.max(r, g, b);
  const d = max - Math.min(r, g, b);
  let h = 0;
  if (d) h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  node.style.setProperty('--plush-h', `${Math.round(((h * 60) + 360) % 360)}`);
}

export async function copyText(button: HTMLButtonElement, text: string, done = 'Copied!') {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const area = Object.assign(document.createElement('textarea'), {value: text});
    document.body.append(area);
    area.select();
    document.execCommand('copy');
    area.remove();
  }
  const label = button.dataset.label ?? button.textContent ?? '';
  button.dataset.label = label;
  button.textContent = done;
  button.classList.add('is-done');
  setTimeout(() => {
    button.textContent = label;
    button.classList.remove('is-done');
  }, 1400);
}

/** A tablist; calls `select` with the chosen id (and once for the first). */
export function tabs<T extends string>(list: HTMLElement, items: readonly {id: T; label: string}[], select: (id: T) => void) {
  list.setAttribute('role', 'tablist');
  const buttons = items.map((item, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.role = 'tab';
    b.className = 'tab';
    b.textContent = item.label;
    b.addEventListener('click', () => choose(i));
    list.append(b);
    return b;
  });
  const choose = (i: number) => {
    buttons.forEach((b, j) => {
      b.setAttribute('aria-selected', String(i === j));
      b.tabIndex = i === j ? 0 : -1;
    });
    select(items[i].id);
  };
  list.addEventListener('keydown', event => {
    const i = buttons.indexOf(document.activeElement as HTMLButtonElement);
    const step = {ArrowRight: 1, ArrowLeft: -1}[event.key];
    if (i < 0 || !step) return;
    const next = (i + step + buttons.length) % buttons.length;
    buttons[next].focus();
    choose(next);
  });
  choose(0);
}

// ---------------------------------------------------------------------------
// Light / dark: auto → light → dark → auto.

const store = {
  set: (key: string, value: string | null) => {
    try {
      if (value === null) localStorage.removeItem(key);
      else localStorage.setItem(key, value);
    } catch {
      /* private mode */
    }
  },
};

export function setupTheme() {
  const root = document.documentElement;
  const button = document.querySelector<HTMLButtonElement>('.theme-btn')!;
  const show = () => {
    const theme = root.dataset.theme ?? 'auto';
    button.setAttribute('aria-label', `Colour theme: ${theme}`);
    button.dataset.mode = theme;
  };
  button.addEventListener('click', () => {
    const next = {auto: 'light', light: 'dark', dark: 'auto'}[root.dataset.theme ?? 'auto']!;
    if (next === 'auto') delete root.dataset.theme;
    else root.dataset.theme = next;
    store.set('plushies-theme', next === 'auto' ? null : next);
    show();
  });
  show();
}
