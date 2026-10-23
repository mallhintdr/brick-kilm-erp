import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { X, ChevronLeft, ChevronRight, Play, BookOpen } from 'lucide-react';
import { useT, useLang } from '../i18n.js';
import { TOURS, TOUR_GROUPS } from './tours.js';
import { Sheet, cx } from './ui.jsx';

// Guided tours: each step highlights one part of a screen with an explanation and "step x of y".
// Next can perform the step's action (open a page, press a button) before moving on, so the
// learner sees the real workflow happen. Started from the ? button or automatically the first time.
export const startTour = (id) => window.dispatchEvent(new CustomEvent('tour-start', { detail: id }));

const find = (sel) => {
  if (!sel) return null;
  const all = [...document.querySelectorAll(sel)];
  return all.find((el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; }) || null;
};
const waitFor = (sel, ms = 3500) => new Promise((resolve) => {
  const t0 = Date.now();
  const tick = () => { const el = find(sel); if (el || Date.now() - t0 > ms) resolve(el); else setTimeout(tick, 120); };
  tick();
});

export default function TourHost() {
  const t = useT();
  const { lang } = useLang();
  const nav = useNavigate();
  const loc = useLocation();
  const [tour, setTour] = useState(null); // { id, i }
  const [menu, setMenu] = useState(false);
  const [rect, setRect] = useState(null);
  const [busy, setBusy] = useState(false);
  const elRef = useRef(null);
  const [cardH, setCardH] = useState(240);
  const ur = lang === 'ur';

  useEffect(() => {
    const onStart = (e) => { setMenu(false); setTour({ id: e.detail, i: 0 }); };
    const onMenu = () => setMenu(true);
    window.addEventListener('tour-start', onStart);
    window.addEventListener('tour-menu', onMenu);
    return () => { window.removeEventListener('tour-start', onStart); window.removeEventListener('tour-menu', onMenu); };
  }, []);

  // first time on Home: offer the getting-started tour once
  useEffect(() => {
    if (loc.pathname !== '/home') return;
    let seen = true;
    try { seen = localStorage.getItem('tourSeen') === '1'; localStorage.setItem('tourSeen', '1'); } catch { /* storage off */ }
    if (!seen) setTimeout(() => startTour('start'), 900);
  }, [loc.pathname]);

  const def = tour && TOURS.find((x) => x.id === tour.id);
  const step = def && def.steps[tour.i];

  // go to the step's page, find its element, bring it into view
  useEffect(() => {
    if (!step) return undefined;
    let alive = true;
    (async () => {
      setRect(null);
      if (step.route && loc.pathname !== step.route) nav(step.route);
      const el = await waitFor(step.target);
      if (!alive) return;
      elRef.current = el;
      if (el) el.scrollIntoView({ block: 'center', behavior: 'smooth' });
      setTimeout(() => alive && measure(), 350);
    })();
    return () => { alive = false; };
  }, [tour?.id, tour?.i]);

  const measure = () => {
    const el = elRef.current;
    if (!el || !document.contains(el)) { setRect(null); return; }
    const r = el.getBoundingClientRect();
    setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
  };
  useLayoutEffect(() => {
    if (!step) return undefined;
    const on = () => measure();
    window.addEventListener('resize', on); window.addEventListener('scroll', on, true);
    const id = setInterval(on, 400);
    return () => { window.removeEventListener('resize', on); window.removeEventListener('scroll', on, true); clearInterval(id); };
  }, [step]);

  const end = () => { setTour(null); setRect(null); elRef.current = null; };
  async function next() {
    if (busy) return;
    setBusy(true);
    try {
      // perform the step's action first, so the next step shows its result
      if (step.action === 'click') (elRef.current || find(step.target))?.click();
      if (step.action === 'clickFirst' && step.actionTarget) (await waitFor(step.actionTarget))?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      if (step.action === 'close') find('[data-tour="sheet-close"]')?.click();
      if (step.action === 'route' && step.actionRoute) nav(step.actionRoute);
    } catch { /* keep going */ }
    setTimeout(() => {
      setBusy(false);
      if (tour.i + 1 >= def.steps.length) end(); else setTour({ ...tour, i: tour.i + 1 });
    }, step.action ? 450 : 0);
  }
  const back = () => tour.i > 0 && setTour({ ...tour, i: tour.i - 1 });

  // menu of tours (from the ? button)
  const menuEl = menu && (
    <Sheet title={t.tourTitle} onClose={() => setMenu(false)}>
      <p className="m-0 text-sm text-n-600">{t.tourIntro}</p>
      <div className="grid gap-2">
        {TOUR_GROUPS.flatMap(([g, en, urT]) => [
          <h3 key={`h-${g}`} className="m-0 mt-2 text-xs font-bold uppercase tracking-wide text-n-500">{ur ? urT : en}</h3>,
          ...TOURS.filter((x) => x.group === g).map((x) => (
          <button key={x.id} type="button" onClick={() => startTour(x.id)}
            className="flex items-center gap-3 rounded-xl border-0 bg-white p-3 text-start ring-1 ring-n-200 hover:bg-brand-50">
            <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-brand-600 text-white"><Play className="size-4" /></span>
            <span className="grid min-w-0 flex-1">
              <strong className="text-md text-n-900">{ur ? x.titleUr : x.title}</strong>
              <span className="text-xs text-n-500">{x.steps.length} {t.tourSteps}</span>
            </span>
          </button>
          )),
        ])}
        <a href={ur ? '/guide-ur.html' : '/guide.html'} className="flex items-center gap-3 rounded-xl bg-n-50 p-3 text-n-900 no-underline ring-1 ring-n-200">
          <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-slate-700 text-white"><BookOpen className="size-4" /></span>
          <strong className="text-md">{t.tourReadGuide}</strong>
        </a>
      </div>
    </Sheet>
  );
  if (!step) return menuEl || null;

  // spotlight box and the explanation card beside it
  const pad = 6;
  const vw = window.innerWidth; const vh = window.innerHeight;
  const cardW = Math.min(340, vw - 24);
  const box = rect && { top: rect.top - pad, left: rect.left - pad, width: rect.width + pad * 2, height: rect.height + pad * 2 };
  let cardStyle = { left: (vw - cardW) / 2, bottom: 16 };
  if (box) {
    // below the highlight if it fits, else above it, else at the screen end away from it
    const left = Math.min(Math.max(12, box.left + box.width / 2 - cardW / 2), vw - cardW - 12);
    const below = box.top + box.height + 14;
    if (vh - below >= cardH + 16) cardStyle = { top: below, left };
    else if (box.top - 20 >= cardH + 12) cardStyle = { top: box.top - 20 - cardH, left };
    else cardStyle = box.top + box.height / 2 > vh / 2 ? { top: 12, left } : { bottom: 16, left };
  }
  const n = def.steps.length;
  return (
    <div className="fixed inset-0 z-[70]" role="dialog" aria-modal="true" aria-label={ur ? def.titleUr : def.title}>
      {/* dim everything except the highlighted part; taps on the dim area do nothing */}
      {box
        ? (
          <>
            {/* four dark panels around the highlighted part, and an orange frame on it */}
            {[
              { top: 0, left: 0, right: 0, height: Math.max(0, box.top) },
              { top: box.top + box.height, left: 0, right: 0, bottom: 0 },
              { top: box.top, left: 0, width: Math.max(0, box.left), height: box.height },
              { top: box.top, left: box.left + box.width, right: 0, height: box.height },
            ].map((st, i) => <div key={i} className="fixed" style={{ ...st, background: 'rgba(15,23,42,.62)' }} />)}
            <div className="pointer-events-none fixed rounded-xl transition-all duration-300" style={{ ...box, outline: '4px solid #f97316' }} />
          </>
        )
        : <div className="fixed inset-0 bg-slate-900/60" />}
      <div className="absolute inset-0" />
      <div ref={(el) => { if (el && Math.abs(el.offsetHeight - cardH) > 4) setCardH(el.offsetHeight); }} className="fixed grid gap-2 rounded-2xl bg-white p-4 text-n-900 shadow-2xl ring-1 ring-n-200 transition-all duration-300" style={{ width: cardW, ...cardStyle }}>
        <div className="flex items-center justify-between gap-2">
          <span className="rounded-full bg-brand-100 px-2.5 py-0.5 text-xs font-bold text-brand-800">{t.tourStep} {tour.i + 1} / {n}</span>
          <button type="button" onClick={end} aria-label={t.tourSkip} className="grid size-8 min-h-0 place-items-center rounded-md border-0 bg-transparent p-0 text-n-500 hover:bg-n-100"><X className="size-4" /></button>
        </div>
        <strong className="text-lg leading-snug">{ur ? step.titleUr : step.title}</strong>
        <p className="m-0 text-md leading-relaxed text-n-700">{ur ? step.textUr : step.text}</p>
        <div className="h-1.5 overflow-hidden rounded-full bg-n-100"><div className="h-full rounded-full bg-brand-600 transition-[width] duration-300" style={{ width: `${((tour.i + 1) / n) * 100}%` }} /></div>
        <div className="flex items-center justify-between gap-2">
          <button type="button" onClick={end} className="border-0 bg-transparent p-0 text-sm font-semibold text-n-500">{t.tourSkip}</button>
          <div className="flex gap-2">
            {tour.i > 0 && <button type="button" onClick={back} className="inline-flex min-h-10 items-center gap-1 rounded-lg border-0 bg-n-100 px-3 text-sm font-semibold text-n-700"><ChevronLeft className="size-4 rtl:rotate-180" />{t.tourBack}</button>}
            <button type="button" onClick={next} disabled={busy} className={cx('inline-flex min-h-10 items-center gap-1 rounded-lg border-0 bg-brand-600 px-4 text-sm font-bold text-white', busy && 'opacity-60')}>
              {tour.i + 1 >= n ? t.tourDone : (ur ? step.nextUr : step.next) || t.tourNext}<ChevronRight className="size-4 rtl:rotate-180" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
