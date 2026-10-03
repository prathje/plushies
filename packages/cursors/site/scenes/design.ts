/** A design file: two frames on a dotted canvas, a layers list and a properties panel. */
import {$, $$, groupTask, htmlTask, other, type Scene} from './kit';

const brands = ['#7c3aed', '#e8574f', '#0ea5a4', '#f59e0b'];
const images = ['linear-gradient(135deg, #f47c9a, #f5c518)', 'linear-gradient(135deg, #7cc4f4, #7c3aed)', 'linear-gradient(135deg, #8fd19e, #0ea5a4)'];
const layerNames = ['Hero / Desktop', 'Landing / Desktop', 'Home / Desktop'];
const frames = () => $$('#fig .frame');

/** The property panel mirrors the selected frame. */
const showProps = () => {
  const frame = $('#fig-desktop');
  const s = getComputedStyle(frame);
  $('#fig-fill').textContent = s.getPropertyValue('--brand').trim().toUpperCase();
  $('#fig-radius').textContent = s.getPropertyValue('--r').trim();
};

export const design: Scene = {
  id: 'design',
  label: 'Design file',
  note: 'A design file: desktop and mobile frames on a canvas, with a layers list and a properties panel that follow the edits.',
  tasks: [
    htmlTask('#fig-button', {
      text: 'Picking a brand colour',
      steps: ['Pulling the palette', 'Checking contrast on white'],
      finish: 'Brand colour updated',
      click: true,
      apply: () => {
        const next = other(brands, getComputedStyle($('#fig-desktop')).getPropertyValue('--brand').trim());
        for (const f of frames()) f.style.setProperty('--brand', next);
        showProps();
      },
    }),
    htmlTask('#fig-cards', {
      text: 'Rounding the cards',
      steps: ['Trying 4, 8 and 16', 'Matching the button'],
      finish: 'Corner radius set',
      apply: () => {
        const next = other(['4px', '8px', '16px'], getComputedStyle($('#fig-desktop')).getPropertyValue('--r').trim());
        for (const f of frames()) f.style.setProperty('--r', next);
        showProps();
      },
    }),
    htmlTask('#fig-img', {
      text: 'Swapping the hero image',
      steps: ['Browsing the shoot', 'Cropping to 4:3'],
      finish: 'New hero image',
      apply: () => {
        const el = $('#fig-img');
        const next = other(images, el.style.getPropertyValue('--img'));
        for (const img of $$('#fig .fig-img')) img.style.setProperty('--img', next);
      },
    }),
    htmlTask('#fig-hero', {
      text: 'Aligning the hero text',
      steps: ['Measuring the grid', 'Snapping to the 8 px column'],
      finish: 'Text on the grid',
      apply: () => {
        const el = $('#fig-hero');
        el.classList.toggle('shifted');
      },
    }),
    htmlTask('#fig-layer', {
      text: 'Renaming the layer',
      steps: ['Following the naming scheme'],
      finish: 'Layer renamed',
      click: true,
      apply: () => {
        const el = $('#fig-layer');
        el.textContent = other(layerNames, el.textContent);
        $('#fig-desktop .frame-name').textContent = el.textContent;
      },
    }),
    groupTask('fig-mobile', () => [$('#fig-mobile')], {
      text: 'Checking the mobile frame',
      steps: ['Stacking the sections', 'Fitting the image above the fold'],
      finish: 'Mobile frame adapted',
      apply: () => $('#fig-mobile').classList.toggle('stacked'),
    }),
  ],
};
