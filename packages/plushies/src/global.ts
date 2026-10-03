/** `<script src=".../plushies.global.js">` entry: everything from 'plushies/bundled' on `window.Plushies`. */
import * as Plushies from './bundled.js';

declare global {
  interface Window {
    Plushies: typeof Plushies;
  }
}

window.Plushies = Plushies;
