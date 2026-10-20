import { forwardRef } from 'react';
import AmountHintC, { fmtMoney as fmtM, unfmtMoney as unfmtM } from './AmountHint.jsx';

// Shared building blocks (Tailwind). Every page uses these, so buttons, boxes, cards and tables
// look the same everywhere, on phones and on desktop, in English and Urdu.
export const cx = (...a) => a.flat().filter(Boolean).join(' ');

/* ---------- Buttons ---------- */
const BTN = {
  primary: 'bg-brand-600 text-white shadow-sm hover:bg-brand-700 active:bg-brand-800',
  secondary: 'bg-white text-n-700 ring-1 ring-n-300 hover:bg-n-50 hover:ring-n-400',
  danger: 'bg-loss text-white hover:bg-red-700',
  dangerGhost: 'bg-white text-loss ring-1 ring-red-200 hover:bg-red-50',
  ghost: 'bg-transparent text-n-700 hover:bg-n-100',
};
export const Button = forwardRef(function Button({ variant = 'primary', size = 'md', block, loading, className, children, disabled, type = 'button', ...rest }, ref) {
  return (
    <button
      ref={ref} type={type} disabled={disabled || loading}
      className={cx(
        'inline-flex items-center justify-center gap-2 rounded-lg font-semibold transition-colors select-none border-0',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 disabled:opacity-50 disabled:cursor-not-allowed',
        size === 'sm' ? 'min-h-9 px-3 text-sm' : 'min-h-11 px-4 text-base',
        block && 'w-full', BTN[variant], className,
      )}
      {...rest}
    >
      {loading && <span className="size-4 animate-spin rounded-full border-2 border-current border-r-transparent" aria-hidden="true" />}
      {children}
    </button>
  );
});
export const IconButton = ({ label, className, children, ...rest }) => (
  <button type="button" aria-label={label} title={label} className={cx('grid size-10 place-items-center rounded-lg text-n-600 hover:bg-n-100 border-0 bg-transparent', className)} {...rest}>{children}</button>
);

/* ---------- Cards and titles ---------- */
export const Card = ({ className, children, ...rest }) => (
  <div className={cx('rounded-lg bg-white shadow-[0_1px_2px_rgba(28,25,23,.05)] ring-1 ring-n-200', className)} {...rest}>{children}</div>
);
// title row at the top of a card (with optional right side: a button, a count…)
export const CardHeader = ({ title, children, className }) => (
  <div className={cx('flex flex-wrap items-center justify-between gap-2 border-b border-n-100 px-4 py-3', className)}>
    <h2 className="m-0 text-lg font-bold text-n-900">{title}</h2>
    {children}
  </div>
);
export const CardBody = ({ className, children }) => <div className={cx('grid gap-3 p-4', className)}>{children}</div>;
// section title: plain (no fill, so it never mixes with the coloured number cards), bold and a step
// larger than the card text, with a thin line underneath
export const SectionTitle = ({ children, className }) => (
  <h3 className={cx('m-0 border-b border-n-200 pb-1.5 text-center text-base font-extrabold text-n-900', className)}>{children}</h3>
);
export const Section = ({ title, children, className }) => (
  <section className={cx('grid gap-3', className)}>
    {title && <SectionTitle>{title}</SectionTitle>}
    {children}
  </section>
);

/* ---------- Form fields ---------- */
const BOX = 'w-full min-h-11 rounded-lg bg-white px-3.5 py-2 text-[16px] font-normal text-n-900 ring-1 ring-n-300 border-0 outline-none placeholder:text-n-400 focus:ring-2 focus:ring-brand-500 disabled:bg-n-100 disabled:opacity-70';
export const Field = ({ label, hint, error, className, children }) => (
  <label className={cx('flex min-w-0 flex-col gap-1.5 text-md font-medium text-n-700', className)}>
    <span className="truncate text-md font-medium">{label}</span>
    {children}
    {error ? <span className="text-xs font-medium text-loss">{error}</span> : hint ? <span className="text-xs font-normal text-n-500">{hint}</span> : null}
  </label>
);
export const Input = forwardRef(function Input({ className, ...p }, ref) { return <input ref={ref} className={cx(BOX, className)} {...p} />; });
export const Select = forwardRef(function Select({ className, children, ...p }, ref) {
  return <select ref={ref} className={cx(BOX, 'appearance-none bg-[url("data:image/svg+xml,%3Csvg%20xmlns=%27http://www.w3.org/2000/svg%27%20viewBox=%270%200%2020%2020%27%20fill=%27%2378716c%27%3E%3Cpath%20d=%27M5.2%207.2a.8.8%200%20011.1%200L10%2011l3.7-3.8a.8.8%200%20111.1%201.1l-4.2%204.5a.8.8%200%2001-1.1%200L5.2%208.3a.8.8%200%20010-1.1z%27/%3E%3C/svg%3E")] bg-[length:18px] bg-[right_10px_center] bg-no-repeat pe-9 rtl:bg-[left_10px_center]', className)} {...p}>{children}</select>;
});
export const Textarea = forwardRef(function Textarea({ className, ...p }, ref) { return <textarea ref={ref} className={cx(BOX, 'min-h-24 py-2.5', className)} {...p} />; });
export const FormGrid = ({ className, children }) => <div className={cx('grid grid-cols-1 gap-3 sm:grid-cols-2', className)}>{children}</div>;

/* ---------- Numbers ---------- */
const TONE = {
  orange: '234 88 12', blue: '2 132 199', violet: '124 58 237', teal: '13 148 136', pink: '219 39 119',
  green: '22 163 74', red: '220 38 38', amber: '217 119 6', slate: '71 85 105',
};
// a number card: gradient in its own colour, soft coloured shadow, small lift on tap
export const StatCard = ({ label, value, tone = 'orange', valueClass, className, children }) => (
  <div
    className={cx('flex min-w-0 flex-col items-center justify-center gap-0.5 rounded-xl px-3 py-2.5 text-center ring-1 transition-transform hover:-translate-y-0.5', className)}
    style={{ '--t': TONE[tone] || TONE.orange, background: 'linear-gradient(160deg, rgb(var(--t) / .07), rgb(var(--t) / .2))', boxShadow: '0 4px 14px -6px rgb(var(--t) / .45)', '--tw-ring-color': 'rgb(var(--t) / .3)' }}
  >
    <span className="text-xs font-semibold" style={{ color: 'color-mix(in srgb, rgb(var(--t)) 40%, #44403c)' }}>{label}</span>
    <strong className={cx('text-xl font-extrabold tabular-nums', valueClass)} style={valueClass ? undefined : { color: 'color-mix(in srgb, rgb(var(--t)) 75%, #1c1917)' }}>{value}</strong>
    {children}
  </div>
);
export const StatGrid = ({ className, children }) => <div className={cx('grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4', className)}>{children}</div>;
const TONES5 = ['orange', 'blue', 'violet', 'teal', 'pink'];
export const toneAt = (i) => TONES5[i % TONES5.length];

/* ---------- Tabs (grey track, chosen option white) ---------- */
export const Tabs = ({ options, value, onChange, className, size = 'md' }) => (
  <div role="tablist" className={cx('grid gap-1 rounded-lg bg-n-100 p-1', className)} style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
    {options.map(([k, label]) => (
      <button
        key={k} type="button" role="tab" aria-selected={value === k} onClick={() => onChange(k)}
        className={cx('min-w-0 rounded-md border-0 px-1.5 font-semibold leading-tight transition', size === 'sm' ? 'min-h-8 text-xs' : 'min-h-9 text-sm',
          value === k ? 'bg-white text-brand-700 shadow-sm' : 'bg-transparent text-n-600 hover:text-n-900')}
      >{label}</button>
    ))}
  </div>
);

/* ---------- Small pieces ---------- */
const BADGE = { neutral: 'bg-n-100 text-n-700', ok: 'bg-green-50 text-gain', err: 'bg-red-50 text-loss', warn: 'bg-amber-50 text-caution', brand: 'bg-brand-50 text-brand-700' };
export const Badge = ({ tone = 'neutral', className, children }) => (
  <span className={cx('inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold', BADGE[tone], className)}>{children}</span>
);
export const Alert = ({ tone = 'ok', children, className }) => (
  <p role={tone === 'err' ? 'alert' : 'status'} className={cx('m-0 rounded-md px-3 py-2.5 text-md font-medium', tone === 'err' ? 'bg-red-50 text-loss' : 'bg-green-50 text-gain', className)}>{children}</p>
);
export const Muted = ({ className, children }) => <p className={cx('m-0 text-center text-sm text-n-500', className)}>{children}</p>;

/* ---------- Tables ---------- */
// card with a title row and a scrolling table; header peach, filter row paler, zebra rows
export const TableCard = ({ title, actions, className, children }) => (
  <Card className={cx('overflow-hidden', className)}>
    {title != null && <CardHeader title={title}>{actions}</CardHeader>}
    <div className="table-wrap overflow-x-auto">{children}</div>
  </Card>
);
export const tbl = {
  table: 'w-full border-separate border-spacing-0 text-md',
  th: 'whitespace-nowrap border-b border-e border-brand-200 bg-brand-100 px-2.5 py-2 text-center text-[12.5px] font-bold text-brand-800',
  fth: 'border-b border-n-200 bg-brand-50 p-1',
  td: 'border-b border-n-100 px-2.5 py-2 text-center tabular-nums text-n-900',
  tr: 'odd:bg-white even:bg-zebra hover:bg-brand-50 *:bg-inherit',
  cell: 'w-full min-w-24 min-h-9 rounded-md bg-white px-2 py-1 text-md text-n-900 ring-1 ring-brand-300 border-0 outline-none focus:ring-2 focus:ring-brand-500',
  filter: 'w-full min-h-8 rounded-md bg-white px-2 text-sm ring-1 ring-n-300 border-0 outline-none focus:ring-2 focus:ring-brand-500',
};
export const FilterInput = (p) => <input type="search" className={tbl.filter} {...p} />;
export const ClearFilters = ({ show, onClick, label }) => (show ? <Button size="sm" variant="secondary" onClick={onClick}>✕ {label}</Button> : null);
export const Empty = ({ cols, children }) => <tr><td colSpan={cols} className="px-3 py-6 text-center text-sm text-n-500">{children}</td></tr>;

/* ---------- Sheet: slides up from the bottom on phones, centred box on desktop ---------- */
export const Sheet = ({ title, onClose, children, footer, wide }) => (
  <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6" role="dialog" aria-modal="true" aria-label={title}>
    <div className="absolute inset-0 bg-n-900/40 backdrop-blur-[2px]" onClick={onClose} />
    <div className={cx('relative flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl', wide ? 'sm:max-w-3xl' : 'sm:max-w-lg')}>
      <div className="flex items-center justify-between gap-2 border-b border-brand-200 bg-brand-100 px-4 py-2.5">
        <h2 className="m-0 text-base font-bold text-brand-800">{title}</h2>
        <IconButton label="Close" onClick={onClose} className="size-9 text-brand-800 hover:bg-brand-200">✕</IconButton>
      </div>
      <div className="grid flex-1 gap-3 overflow-y-auto p-4">{children}</div>
      {footer && <div className="border-t border-n-100 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">{footer}</div>}
    </div>
  </div>
);

/* ---------- Filter chips and a from–to date range ---------- */
export const Chips = ({ options, value, onChange, className }) => (
  <div className={cx('flex flex-wrap justify-center gap-1.5', className)}>
    {options.map(([k, label]) => (
      <button key={k} type="button" aria-pressed={value === k} onClick={() => onChange(k)}
        className={cx('min-h-8 rounded-full border-0 px-3 text-xs font-semibold ring-1 transition', value === k ? 'bg-brand-600 text-white ring-brand-600' : 'bg-white text-n-700 ring-n-300 hover:bg-n-50')}>
        {label}
      </button>
    ))}
  </div>
);
export const DateRange = ({ from, to, onFrom, onTo, fromLabel, toLabel, clearLabel = '✕' }) => (
  <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] items-end gap-2">
    <Field label={fromLabel}><Input type="date" value={from} max={to || undefined} onChange={(e) => onFrom(e.target.value)} className="min-h-10" /></Field>
    <Field label={toLabel}><Input type="date" value={to} min={from || undefined} onChange={(e) => onTo(e.target.value)} className="min-h-10" /></Field>
    <Button size="sm" variant="secondary" className="min-h-10" disabled={!from && !to} onClick={() => { onFrom(''); onTo(''); }}>{clearLabel}</Button>
  </div>
);

/* ---------- Money box: 2,45,230 while typing, plain digits to the page, Urdu words underneath ---------- */
export { default as AmountHint, fmtMoney, unfmtMoney } from './AmountHint.jsx';
export const MoneyInput = ({ value, onChange, className, ...p }) => (
  <>
    <Input inputMode="decimal" value={fmtM(value)} onChange={(e) => onChange(unfmtM(e.target.value))} className={cx('font-semibold tabular-nums', className)} {...p} />
    <AmountHintC value={value} />
  </>
);
