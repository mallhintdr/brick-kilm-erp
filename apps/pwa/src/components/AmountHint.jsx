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

// Shown under an amount box while typing (245,230 — 2 Lac 45 Thousand 2 Hundred 30 Rs);
// display only, nothing here is saved.
export default function AmountHint({ value }) {
  const { lang } = useLang();
  const words = amountWords(value, lang);
  if (!words) return null;
  return (
    <span className="amount-hint" aria-live="polite">
      <strong>{Number(value).toLocaleString('en-US', { maximumFractionDigits: 2 })}</strong> — {words}
    </span>
  );
}
