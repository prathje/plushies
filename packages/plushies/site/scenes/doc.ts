/** A document: paragraphs, a list and a comment thread in the margin. */
import {$, htmlTask, other, type Scene} from './kit';

const titles = ['Caring for your plushie', 'Plushie care guide', 'How to care for your plushie'];
const intros = [
  'A plushie that is loved gets dirty, and that is fine. This guide covers washing, drying and the small repairs that keep a well-loved friend together for years.',
  'Loved plushies get dirty. Here is how to wash, dry and mend them so they last for years.',
];

export const doc: Scene = {
  id: 'doc',
  label: 'Document',
  note: 'A document: the helpers tighten paragraphs, fix typos, rework headings and the list, and answer a comment in the margin.',
  tasks: [
    htmlTask('#doc-title', {
      text: 'Reworking the title',
      steps: ['Checking the style guide', 'Trying sentence case'],
      finish: 'Title updated',
      apply: () => {
        const el = $('#doc-title');
        el.textContent = other(titles, el.textContent);
      },
    }),
    htmlTask('#doc-intro', {
      text: 'Tightening the intro',
      steps: ['Cutting the throat-clearing', 'Reading it aloud'],
      finish: 'Intro tightened',
      apply: () => {
        const el = $('#doc-intro');
        el.textContent = other(intros, el.textContent);
      },
    }),
    htmlTask('#doc-p2', {
      text: 'Fixing a typo',
      steps: ['“machien” → “machine”'],
      finish: 'Typo fixed',
      apply: () => {
        const el = $('#doc-p2');
        el.innerHTML = el.textContent!.includes('machien') ? el.innerHTML.replace(/<mark>machien<\/mark>|machien/, 'machine') : el.innerHTML.replace('machine', '<mark>machien</mark>');
      },
    }),
    htmlTask('#doc-h2', {
      text: 'Reworking the heading',
      steps: ['Covering drying too'],
      finish: 'Heading reworked',
      apply: () => {
        const el = $('#doc-h2');
        el.textContent = el.textContent === 'Washing' ? 'Washing and drying' : 'Washing';
      },
    }),
    htmlTask('#doc-list', {
      text: 'Editing the care list',
      steps: ['Adding the drying tip', 'Numbering the steps'],
      finish: 'List updated',
      apply: () => {
        const el = $('#doc-list');
        el.classList.toggle('numbered');
        const extra = el.querySelector('.extra');
        if (extra) extra.remove();
        else {
          const li = document.createElement('li');
          li.className = 'extra';
          li.textContent = 'Air-dry flat, away from radiators';
          el.append(li);
        }
      },
    }),
    htmlTask('#doc-comment', {
      text: 'Answering the comment',
      steps: ['Reading the thread', 'Replying and resolving'],
      finish: 'Comment resolved',
      click: true,
      apply: () => {
        const el = $('#doc-comment');
        const reply = el.querySelector('.reply');
        if (reply) {
          reply.remove();
          el.classList.remove('resolved');
        } else {
          const p = document.createElement('p');
          p.className = 'reply';
          p.innerHTML = '<b>Pip</b>Added under Washing, resolving.';
          el.append(p);
          el.classList.add('resolved');
        }
      },
    }),
  ],
};
