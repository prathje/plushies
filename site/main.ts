import * as THREE from 'three';
import {mountPlushie, type PlushieViewer} from '../src/viewer';
import {renderDocs} from './docs';
import {createEditor} from './editor';
import {FOOTER_LOOK, GALLERY, HERO_LOOK} from './looks';
import {copyText, plushVars, reducedMotion, setupTheme} from './ui';

declare const __REPO__: string | undefined;
const REPO = typeof __REPO__ === 'string' && __REPO__ ? __REPO__ : '';

const $ = <T extends HTMLElement = HTMLElement>(selector: string) => document.querySelector<T>(selector)!;
const calm = reducedMotion();

for (const link of document.querySelectorAll<HTMLAnchorElement>('[data-repo]')) {
  if (!REPO) continue;
  link.href = `https://github.com/${REPO}`;
  link.hidden = false;
}
for (const button of document.querySelectorAll<HTMLButtonElement>('[data-copy-text]')) {
  button.addEventListener('click', () => copyText(button, button.dataset.copyText!));
}

// Hero ----------------------------------------------------------------------
const heroStage = $('.hero-stage');
const hero = mountPlushie($('#hero-plush'), THREE, {...HERO_LOOK, idle: !calm, followPointer: true});
hero.canvas.addEventListener('click', () => void hero.hop(80));
plushVars(heroStage, HERO_LOOK.color!);

// Editor --------------------------------------------------------------------
const editor = createEditor({
  stage: $('.editor-stage'),
  host: $('#editor-plush'),
  controls: $<HTMLFormElement>('#controls'),
  tabs: $('#code-tabs'),
  code: $('#code-out'),
  codeCopy: $<HTMLButtonElement>('#code-copy'),
  share: $<HTMLInputElement>('#share-url'),
  shareCopy: $<HTMLButtonElement>('#share-copy'),
});

// Gallery: each card mounts when it first scrolls near, and only idles and follows the pointer while visible.
const grid = $('#gallery-grid');
const viewers = new Map<Element, PlushieViewer>();
const visibility = new IntersectionObserver(
  entries => {
    for (const entry of entries) {
      const card = entry.target as HTMLElement;
      let view = viewers.get(card);
      if (!view && entry.isIntersecting) {
        const item = GALLERY[Number(card.dataset.index)];
        view = mountPlushie(card.querySelector<HTMLElement>('.plush-host')!, THREE, item.look);
        view.canvas.addEventListener('click', () => void view!.hop(50));
        viewers.set(card, view);
      }
      view?.setIdle(entry.isIntersecting && !calm);
      view?.setFollowPointer(entry.isIntersecting);
    }
  },
  {rootMargin: '200px'},
);
GALLERY.forEach((item, index) => {
  const card = document.createElement('article');
  card.className = 'look';
  card.dataset.index = String(index);
  plushVars(card, item.look.color!);
  const spec = [item.look.kind, item.look.fabric ?? 'plush', item.look.hat && item.look.hat !== 'none' ? item.look.hat : '', item.look.glasses && item.look.glasses !== 'none' ? item.look.glasses : '']
    .filter(Boolean)
    .join(' · ');
  card.innerHTML = `
    <div class="look-stage"><div class="stage-mat" aria-hidden="true"></div><div class="plush-host" role="img" aria-label="${item.name}, a ${item.look.kind} plushie"></div></div>
    <div class="look-caption">
      <h3 class="look-name">${item.name}</h3>
      <p class="look-spec">${spec}</p>
      <button type="button" class="btn btn-secondary btn-small">Open in editor</button>
    </div>`;
  card.querySelector('button')!.addEventListener('click', () => {
    editor.load(item.look);
    $('#editor').scrollIntoView({behavior: calm ? 'auto' : 'smooth'});
  });
  grid.append(card);
  visibility.observe(card);
});

// Footer mascot: a sleepy drop, mounted when the footer comes into view.
const footerHost = $('#footer-plush');
new IntersectionObserver((entries, observer) => {
  if (!entries.some(e => e.isIntersecting)) return;
  observer.disconnect();
  const view = mountPlushie(footerHost, THREE, {...FOOTER_LOOK, idle: !calm});
  view.canvas.addEventListener('click', () => void view.hop(30));
}).observe(footerHost);

renderDocs($('#docs-body'));
setupTheme();
