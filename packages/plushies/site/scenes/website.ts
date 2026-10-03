/** A landing page in a browser window: copy, colours and layout edited live. */
import {$, $$, htmlTask, other, type Scene} from './kit';

const headlines = ['Soft things, made to last.', 'Hug-tested. Kid-approved.', 'Stuffed with care.', 'Made for squeezing.'];
const blurbs = ['Hand-stitched from recycled felt, in a small workshop by the sea.', 'Every plushie is hand-stitched and ships in a reusable bag.', 'Recycled felt, natural dyes, and a lifetime of hugs.'];
const ctas = ['#7c3aed', '#e8574f', '#0ea5a4', '#1b1b1f'];
const images = ['linear-gradient(135deg, #f47c9a, #f5c518)', 'linear-gradient(135deg, #7cc4f4, #7c3aed)', 'linear-gradient(135deg, #8fd19e, #0ea5a4)'];
const footers = ['© Plush Co. 2026 · Privacy · Terms', '© Plush Co. · Privacy · Terms · Press', '© Plush Co. 2026 · Privacy · Terms · Imprint'];

export const website: Scene = {
  id: 'website',
  label: 'Website',
  note: 'A landing page in a browser window. The helpers rewrite copy, swap the hero image and tune colours and spacing on the live page.',
  tasks: [
    htmlTask('#web-h1', {
      text: 'Rewriting the hero copy',
      steps: ['Reading the brand voice', 'Trying three headlines', 'Keeping it to one line'],
      finish: 'Hero copy sharper',
      apply: () => {
        const el = $('#web-h1');
        el.textContent = other(headlines, el.textContent);
      },
    }),
    htmlTask('#web-p', {
      text: 'Tightening the subheading',
      steps: ['Cutting a clause', 'Reading it aloud'],
      finish: 'Subheading tightened',
      apply: () => {
        const el = $('#web-p');
        el.textContent = other(blurbs, el.textContent);
      },
    }),
    htmlTask('#web-cta', {
      text: 'Testing the call to action',
      steps: ['Checking contrast', 'Clicking through'],
      finish: 'Button recoloured',
      click: true,
      apply: () => {
        const el = $('#web-cta');
        el.style.setProperty('--cta', other(ctas, el.style.getPropertyValue('--cta')));
      },
    }),
    htmlTask('#web-img', {
      text: 'Swapping the hero image',
      steps: ['Picking from the shoot', 'Compressing to WebP'],
      finish: 'Hero image replaced',
      apply: () => {
        const el = $('#web-img');
        el.style.setProperty('--img', other(images, el.style.getPropertyValue('--img')));
      },
    }),
    htmlTask('#web-cards', {
      text: 'Reordering the features',
      steps: ['Putting shipping first', 'Checking the mobile stack'],
      finish: 'Features reordered',
      apply: () => {
        const row = $('#web-cards');
        const cards = $$(':scope > div', row);
        row.append(cards[0]);
      },
    }),
    htmlTask('#web-nav', {
      text: 'Fixing the nav spacing',
      steps: ['Measuring the gaps', 'Evening them out'],
      finish: 'Nav spacing even',
      apply: () => {
        const el = $('#web-nav');
        el.style.setProperty('--gap', other(['2cqw', '3cqw', '4.5cqw'], el.style.getPropertyValue('--gap')));
      },
    }),
    htmlTask('#web-footer', {
      text: 'Updating the footer',
      steps: ['Adding the legal links'],
      finish: 'Footer updated',
      apply: () => {
        const el = $('#web-footer');
        el.textContent = other(footers, el.textContent);
      },
    }),
  ],
};
