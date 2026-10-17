import { useLang } from '../i18n.js';

// Pakistani grouping: 2,45,230 / 1,02,45,230 (crore, lakh, thousand)
export function pkGroup(n) {
  const [int, dec] = String(n).split('.');
  const s = int.replace(/^0+(?=\d)/, '');
  const last3 = s.slice(-3);
  const rest = s.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ',');
  return (rest ? `${rest},${last3}` : last3) + (dec ? `.${dec}` : '');
}

// 245230 -> "2 Lac 45 Thousand 2 Hundred 30 Rs" (Urdu: 2 لاکھ 45 ہزار 2 سو 30 روپے)
export function amountWords(value, lang = 'en') {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return '';
  const w = lang === 'ur'
    ? { crore: 'کروڑ', lac: 'لاکھ', thousand: 'ہزار', hundred: 'سو', rs: 'روپے', paisa: 'پیسے' }
    : { crore: 'Crore', lac: 'Lac', thousand: 'Thousand', hundred: 'Hundred', rs: 'Rs', paisa: 'Paisa' };
  let rupees = Math.floor(n);
  const paisa = Math.round((n - rupees) * 100);
  const parts = [];
  for (const [size, word] of [[1e7, w.crore], [1e5, w.lac], [1e3, w.thousand], [1e2, w.hundred]]) {
    const q = Math.floor(rupees / size);
    if (q) { parts.push(`${size === 1e7 ? pkGroup(q) : q} ${word}`); rupees -= q * size; }
  }
  if (rupees) parts.push(String(rupees));
  let out = parts.length ? `${parts.join(' ')} ${w.rs}` : '';
  if (paisa) out += `${out ? ' ' : ''}${paisa} ${w.paisa}`;
  return out;
}

// Shown under an amount box while typing, always in Urdu, right to left (largest unit on the right):
// 2 لاکھ 45 ہزار 2 سو 30 روپے. Display only, nothing here is saved.
export default function AmountHint({ value }) {
  const words = amountWords(String(value ?? '').replace(/,/g, ''), 'ur');
  // always rendered (empty when no amount) so the box keeps its height and the row never jumps
  return <span className="amount-hint" dir="rtl" lang="ur" aria-live="polite">{words}</span>;
}

// Money box that shows thousands separators while typing (245,230) but hands back plain digits.
export const fmtMoney = (raw) => {
  const s = String(raw ?? '').replace(/,/g, '');
  if (!s) return '';
  const [int, dec] = s.split('.');
  const g = int.replace(/^0+(?=\d)/, '').replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return dec !== undefined ? `${g}.${dec.slice(0, 2)}` : g;
};
export const unfmtMoney = (shown) => {
  const s = String(shown ?? '').replace(/[^\d.]/g, '');
  const i = s.indexOf('.');
  return i < 0 ? s : `${s.slice(0, i + 1)}${s.slice(i + 1).replace(/\./g, '').slice(0, 2)}`;
};