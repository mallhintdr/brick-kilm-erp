import { useMemo } from 'react';

// Portrait plan of a kiln counted in lines: side A runs top -> bottom down the left (lines 1-120),
// side B runs bottom -> top up the right (121-240), so line order == the direction the fire travels.
// Each line is a thin strip coloured by its state; tap one to act on it.
const STRIP_W = 96; const PITCH = 5; const STRIP_H = 4;
const PADX = 34; const CORR = 44; const TOP = 64; const BOTTOM = 24;

export const LINE_FILL = {
  Empty: '#e2e8f0',
  Loading: '#60a5fa',
  Preheating: '#f59e0b',
  Firing: '#ef4444',
  Cooling: '#6366f1',
  Unloading: '#22c55e',
};

export default function LineDiagram({ lines, selected, onSelect, t }) {
  const geo = useMemo(() => {
    const perSide = Math.ceil(lines.length / 2);
    const xA = PADX;
    const xB = PADX + STRIP_W + CORR;
    const W = xB + STRIP_W + PADX;
    const H = TOP + perSide * PITCH + BOTTOM;
    const pos = (i) => (i < perSide
      ? { x: xA, y: TOP + i * PITCH, side: 'A' }
      : { x: xB, y: TOP + (perSide - 1 - (i - perSide)) * PITCH, side: 'B' });
    return { perSide, xA, xB, W, H, pos };
  }, [lines.length]);

  if (!lines.length) return null;
  const { perSide, xA, xB, W, H, pos } = geo;
  const corrX = xA + STRIP_W + 8;
  const corrW = CORR - 16;
  const stateLabel = (s) => t[{ Empty: 'empty', Loading: 'loading', Preheating: 'preheating', Firing: 'firingState', Cooling: 'cooling', Unloading: 'unloading' }[s]] || s;

  return (
    <div className="kiln-scroll">
      <div className="kiln kiln-lines">
        <svg viewBox={`0 0 ${W} ${H}`} role="group" aria-label={t.kilnBoard}>
          {/* kiln body */}
          <rect x={xA - 14} y={TOP - 18} width={W - 2 * xA + 28} height={perSide * PITCH + 30} rx="16" fill="#e9d8b8" stroke="#b89a68" strokeWidth="1.5" />
          {/* fire corridor between the two sides, arrows show the fire's direction */}
          <rect x={corrX} y={TOP - 6} width={corrW} height={perSide * PITCH + 10} rx={corrW / 2} fill="#7c5a3a" opacity=".25" />
          <polygon points={`${corrX + 5},${TOP + perSide * PITCH / 2 - 6} ${corrX + 10},${TOP + perSide * PITCH / 2 + 4} ${corrX + 15},${TOP + perSide * PITCH / 2 - 6}`} fill="#7c5a3a" />
          <polygon points={`${corrX + corrW - 15},${TOP + perSide * PITCH / 2 + 4} ${corrX + corrW - 10},${TOP + perSide * PITCH / 2 - 6} ${corrX + corrW - 5},${TOP + perSide * PITCH / 2 + 4}`} fill="#7c5a3a" />
          {/* chimney */}
          <polygon points={`${W / 2 - 9},${TOP - 18} ${W / 2 - 5},14 ${W / 2 + 5},14 ${W / 2 + 9},${TOP - 18}`} fill="#8b5e3c" stroke="#6b4423" />
          <rect x={W / 2 - 8} y="9" width="16" height="6" rx="1.5" fill="#57534e" />
          {/* side labels */}
          <text x={xA + STRIP_W / 2} y={TOP - 24} textAnchor="middle" className="line-side">A · 1–{perSide}</text>
          <text x={xB + STRIP_W / 2} y={TOP - 24} textAnchor="middle" className="line-side">B · {perSide + 1}–{lines.length}</text>

          {lines.map((l, i) => {
            const p = pos(i);
            const sel = selected?.index === l.index;
            return (
              <g key={l.index}>
                <rect
                  className={`line-strip st-${l.state}${sel ? ' line-sel' : ''}`}
                  x={p.x} y={p.y} width={STRIP_W} height={STRIP_H} rx="1"
                  fill={LINE_FILL[l.state] || LINE_FILL.Empty}
                  role="button" tabIndex={0} aria-pressed={sel}
                  aria-label={`${t.line} ${l.index}: ${stateLabel(l.state)}`}
                  onClick={() => onSelect(l)}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(l); } }}
                >
                  <title>{`${t.line} ${l.index} — ${stateLabel(l.state)}${l.currentLoad ? ` — ${l.currentLoad.toLocaleString()}` : ''}`}</title>
                </rect>
                {/* number every 10 lines, on the outer side */}
                {(l.index % 10 === 0 || l.index === 1 || l.index === perSide + 1) && (
                  <text
                    className="line-num" y={p.y + STRIP_H}
                    x={p.side === 'A' ? p.x - 4 : p.x + STRIP_W + 4}
                    textAnchor={p.side === 'A' ? 'end' : 'start'}
                  >
                    {l.index}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}
