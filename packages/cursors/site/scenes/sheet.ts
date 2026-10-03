/** A spreadsheet: a grid of cells with a formula bar, a total to keep right and ranges to fill. */
import {$, $$, groupTask, htmlTask, rand, type Scene} from './kit';

interface Row {
  product: string;
  sep: number;
  oct: number | null;
  price: number;
  cost: number;
}
const rows: Row[] = [
  {product: 'Star', sep: 120, oct: 134, price: 24, cost: 9},
  {product: 'Heart', sep: 98, oct: null, price: 22, cost: 8},
  {product: 'Cloud', sep: 76, oct: null, price: 26, cost: 11},
  {product: 'Moon', sep: 143, oct: 151, price: 24, cost: 9},
  {product: 'Bun', sep: 61, oct: null, price: 19, cost: 7},
  {product: 'Fox', sep: 88, oct: 97, price: 28, cost: 12},
];
const COLS = ['A', 'B', 'C', 'D', 'E', 'F'];
const ROWS = 20;
const TOTAL = rows.length + 2;
const HEADERS = [
  ['Product', 'Units (Sep)', 'Units (Oct)', 'Unit price', 'Revenue'],
  ['Product', 'Sep units', 'Oct units', 'Price', 'Revenue'],
];
const state = {currency: false, totalFixed: false, margin: false, best: false, headers: 0};

// The grid: built once, cells updated in place so tasks can keep pointing at them.
const table = $('#sheet-table');
table.innerHTML = `<thead><tr><th class="row"></th>${COLS.map(c => `<th>${c}</th>`).join('')}</tr></thead><tbody>${Array.from(
  {length: ROWS},
  (_, i) => `<tr data-row="${i + 1}"><th class="row">${i + 1}</th>${COLS.map(c => `<td data-cell="${c}${i + 1}"></td>`).join('')}</tr>`,
).join('')}</tbody>`;
const cell = (ref: string) => $<HTMLTableCellElement>(`[data-cell="${ref}"]`, table);
const range = (col: string, from: number, to: number) => Array.from({length: to - from + 1}, (_, i) => cell(`${col}${from + i}`));
const row = (n: number) => $(`tr[data-row="${n}"]`, table);

const money = (n: number) => (state.currency ? `€ ${n.toFixed(2)}` : String(n));
const revenue = (r: Row) => (r.sep + (r.oct ?? 0)) * r.price;
const best = () => rows.reduce((m, r) => (revenue(r) > revenue(m) ? r : m), rows[0]);
/** The formula bar: the cell being looked at and what's in it. */
const show = (ref: string, formula: string) => {
  for (const c of $$('td.sel', table)) c.classList.remove('sel');
  cell(ref.split(':')[0]).classList.add('sel');
  $('#sheet-ref').textContent = ref;
  $('#sheet-fx').textContent = formula;
};

function render() {
  HEADERS[state.headers].forEach((h, i) => (cell(`${COLS[i]}1`).textContent = h));
  cell('F1').textContent = state.margin ? 'Margin' : '';
  row(1).className = 'head';
  rows.forEach((r, i) => {
    const n = i + 2;
    cell(`A${n}`).textContent = r.product;
    cell(`B${n}`).textContent = String(r.sep);
    cell(`C${n}`).textContent = r.oct === null ? '' : String(r.oct);
    cell(`D${n}`).textContent = money(r.price);
    cell(`E${n}`).textContent = money(revenue(r));
    cell(`F${n}`).textContent = state.margin ? `${Math.round((1 - r.cost / r.price) * 100)} %` : '';
    row(n).classList.toggle('best', state.best && r === best());
  });
  const upto = state.totalFixed ? rows.length : rows.length - 1;
  cell(`A${TOTAL}`).textContent = 'Total';
  cell(`B${TOTAL}`).textContent = String(rows.slice(0, upto).reduce((s, r) => s + r.sep, 0));
  cell(`C${TOTAL}`).textContent = String(rows.slice(0, upto).reduce((s, r) => s + (r.oct ?? 0), 0));
  cell(`E${TOTAL}`).textContent = money(rows.slice(0, upto).reduce((s, r) => s + revenue(r), 0));
  row(TOTAL).className = 'total';
  for (const c of $$('td.num', table)) c.classList.remove('num');
  for (const col of ['B', 'C', 'D', 'E', 'F']) for (const c of range(col, 2, TOTAL)) c.classList.add('num');
}
render();
show('C3', '');

export const sheet: Scene = {
  id: 'sheet',
  label: 'Spreadsheet',
  note: 'A spreadsheet: the helpers fill ranges, fix a total that misses a row, format columns and highlight the best seller.',
  tasks: [
    groupTask('sheet-oct', () => range('C', 2, TOTAL - 1), {
      text: 'Filling in October units',
      steps: ['Pulling the orders export', 'Typing the counts', 'Checking the sum'],
      finish: 'October filled in',
      apply: () => {
        const blank = rows.filter(r => r.oct === null);
        for (const r of blank.length ? blank : rows) r.oct = Math.round(r.sep * rand(0.8, 1.3));
        render();
        show(`C2:C${TOTAL - 1}`, String(rows[0].oct));
      },
    }),
    htmlTask(`#sheet-table [data-cell="E${TOTAL}"]`, {
      text: 'Checking the total formula',
      steps: [`Reading =SUM(E2:E${TOTAL - 2})`, `Extending it to row ${TOTAL - 1}`],
      finish: 'Total covers every row',
      click: true,
      apply: () => {
        state.totalFixed = true;
        render();
        show(`E${TOTAL}`, `=SUM(E2:E${TOTAL - 1})`);
      },
    }),
    groupTask('sheet-prices', () => range('D', 2, TOTAL - 1), {
      text: 'Formatting the prices',
      steps: ['Setting € with two decimals', 'Applying it to revenue too'],
      finish: 'Prices formatted',
      apply: () => {
        state.currency = !state.currency;
        render();
        show(`D2:D${TOTAL - 1}`, money(rows[0].price));
      },
    }),
    groupTask('sheet-best', () => range('A', rows.indexOf(best()) + 2, rows.indexOf(best()) + 2).concat(range('E', rows.indexOf(best()) + 2, rows.indexOf(best()) + 2)), {
      text: 'Highlighting the best seller',
      steps: ['Sorting by revenue', 'Filling the row'],
      finish: 'Best seller highlighted',
      apply: () => {
        state.best = !state.best;
        render();
        const n = rows.indexOf(best()) + 2;
        show(`A${n}:E${n}`, best().product);
      },
    }),
    groupTask('sheet-headers', () => range('A', 1, 1).concat(range('E', 1, 1)), {
      text: 'Tidying the headers',
      steps: ['Shortening the labels', 'Bolding the row'],
      finish: 'Headers tidied',
      apply: () => {
        state.headers = (state.headers + 1) % HEADERS.length;
        render();
        show('A1:E1', HEADERS[state.headers][1]);
      },
    }),
    groupTask('sheet-margin', () => range('F', 1, TOTAL - 1), {
      text: 'Working on the margin column',
      steps: ['Costs from the BOM sheet', '=1 − cost ÷ price'],
      finish: 'Margin column updated',
      apply: () => {
        state.margin = !state.margin;
        render();
        show(`F2:F${TOTAL - 1}`, state.margin ? '=1-G2/D2' : '');
      },
    }),
  ],
};
