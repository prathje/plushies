// The README's first example, type-checked by `bun run typecheck` (not run).
import * as THREE from 'three';
import {createPlushieCursor} from '../src/index';

export async function readmeExample() {
  const editor = document.querySelector<HTMLElement>('#editor')!;
  const headline = document.querySelector('#headline')!;

  const pip = createPlushieCursor(THREE, {
    name: 'Pip',
    look: {kind: 'star', color: '#f5c518', eyes: 'happy', hat: 'cap'},
    design: 'live', // 'live' | 'buddy' | 'island'
    container: editor,
  });

  await pip.pointAt(headline); // glide there and keep following it as it moves
  const glow = pip.highlight(headline);
  pip.status({text: 'Rewriting the headline', detail: 'Trying a few options', progress: 0.3, step: [1, 3]});
  pip.progress(0.8);
  await pip.click();
  await pip.done('Headline is punchier');
  glow.clear(0.8);
}
