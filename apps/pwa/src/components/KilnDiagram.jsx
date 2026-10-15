import { useMemo, useState } from 'react';
import { fmtDateTime } from '../api.js';

// Portrait oblique plan of a zig-zag kiln: chambers are wide, short 3D blocks in two columns
// (left column top->bottom, right column bottom->top) joined by the fire corridor between them.
// Section numbering follows the circuit, so index order == the direction the fire travels.
const CW = 50; const CH = 22; const DEP = 5; const GAP = 5;
const PADX = 52; const CORR = 52; const TOP = 88; const R = 14; // R: corner radius of the end chambers

// Block outline with only the given corners rounded (the kiln's curved ends).
const facePath = (c) => {
  const tl = c === 'tl' ? R : 0; const tr = c === 'tr' ? R : 0; const br = c === 'br' ? R : 0; const bl = c === 'bl' ? R : 0;
  return `M${tl},0 H${CW - tr} A${tr},${tr} 0 0 1 ${CW},${tr} V${CH - br} A${br},${br} 0 0 1 ${CW - br},${CH} H${bl} A${bl},${bl} 0 0 1 0,${CH - bl} V${tl} A${tl},${tl} 0 0 1 ${tl},0 Z`;
};

const STATE_KEY = {
  Empty: 'empty', Loading: 'loading', Preheating: 'preheating', Firing: 'firingState', Cooling: 'cooling', Unloading: 'unloading',
};

export default function KilnDiagram({ sections, selected, onSelect, t }) {
  const [hover, setHover] = useState(null); // { s, cx, cy }
  const N = sections.length;

  const geo = useMemo(() => {
    const colLen = Math.ceil(N / 2);
    const pitch = CH + GAP;
    const colsHeight = colLen * pitch - GAP;
    const xLeft = PADX;
    const xRight = PADX + CW + DEP + CORR;
    const W = xRight + CW + DEP + PADX;
    const H = TOP + colsHeight + 30;
    const pos = (i) => {
      if (i < colLen) return { x: xLeft, y: TOP + i * pitch, col: 'left', corner: i === 0 ? 'tl' : i === colLen - 1 ? 'bl' : null };
      const j = i - colLen; // right column runs bottom -> top
      return { x: xRight, y: TOP + (colLen - 1 - j) * pitch, col: 'right', corner: j === 0 ? 'br' : i === N - 1 ? 'tr' : null };
    };
    const xA = xLeft + CW + DEP + CORR * 0.3;
    const xB = xLeft + CW + DEP + CORR * 0.7;
    return { W, H, colsHeight, pos, xA, xB, xLeft, xRight, yT: TOP + 2, yB: TOP + colsHeight - 2 };
  }, [N]);

  if (!N) return null;
  const { W, H, colsHeight, pos, xA, xB, xLeft, yT, yB } = geo;
  const r = (xB - xA) / 2;
  const firing = sections.some((s) => s.state === 'Firing');
  const chimneyX = W / 2;
  const slabTop = TOP - DEP - 18;
  const stateLabel = (s) => t[STATE_KEY[s.state]] || s.state;

  const items = sections
    .map((s, i) => ({ s, p: pos(i) }))
    .sort((a, b) => a.p.y - b.p.y || a.p.x - b.p.x); // paint back-to-front so side faces tuck under neighbours

  const flamePts = (xc, h) => `${xc - 5},${CH - 2} ${xc},${CH - 2 - h} ${xc + 5},${CH - 2}`;
  return (
    <div className="kiln-scroll">
      <div className="kiln">
        <svg viewBox={`0 0 ${W} ${H}`} role="group" aria-label={t.kilnBoard}>
          <defs>
            <pattern id="kbricks" width="10" height="7" patternUnits="userSpaceOnUse">
              <rect width="10" height="7" fill="none" />
              <path d="M0 0.5H10M0 3.5H10M5 0.5V3.5M0 3.5V7M10 3.5V7" stroke="#000" strokeWidth=".7" fill="none" />
            </pattern>
            <radialGradient id="kglow">
              <stop offset="0%" stopColor="#fde047" stopOpacity=".95" />
              <stop offset="60%" stopColor="#f97316" stopOpacity=".45" />
              <stop offset="100%" stopColor="#f97316" stopOpacity="0" />
            </radialGradient>
            <linearGradient id="kslab" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#e9d8b8" />
              <stop offset="100%" stopColor="#d3b98d" />
            </linearGradient>
          </defs>

          {/* kiln body (masonry slab) and ground shadow */}
          <rect x={xLeft - 14} y={slabTop + 6} width={W - 2 * xLeft + 28} height={colsHeight + TOP - slabTop + 14} rx="18" fill="rgba(28,25,23,.12)" />
          <rect x={xLeft - 16} y={slabTop} width={W - 2 * xLeft + 32} height={colsHeight + TOP - slabTop + 16} rx="18" fill="url(#kslab)" stroke="#b89a68" strokeWidth="1.5" />

          {/* fire corridor: the circuit the fire travels around */}
          <rect x={xA - 8} y={yT - r - 4} width={xB - xA + 16} height={yB - yT + 2 * r + 8} rx={(xB - xA) / 2 + 8} fill="#7c5a3a" opacity=".28" />
          <path
            className="flow" fill="none" stroke={firing ? '#ea580c' : '#a8896a'} strokeWidth="2.5" strokeLinecap="round"
            d={`M${xA} ${yT} V${yB} A${r} ${r} 0 0 0 ${xB} ${yB} V${yT} A${r} ${r} 0 0 0 ${xA} ${yT}`}
          />
          <polygon points={`${xA - 5},${(yT + yB) / 2 - 6} ${xA},${(yT + yB) / 2 + 6} ${xA + 5},${(yT + yB) / 2 - 6}`} fill="#7c5a3a" />
          <polygon points={`${xB - 5},${(yT + yB) / 2 + 6} ${xB},${(yT + yB) / 2 - 6} ${xB + 5},${(yT + yB) / 2 + 6}`} fill="#7c5a3a" />

          {/* chimney + ID fan house */}
          <g>
            <polygon points={`${chimneyX - 10},${slabTop + 4} ${chimneyX - 6},26 ${chimneyX + 6},26 ${chimneyX + 10},${slabTop + 4}`} fill="#8b5e3c" stroke="#6b4423" />
            {[40, 54, 68].map((y) => <line key={y} x1={chimneyX - 8} x2={chimneyX + 8} y1={y} y2={y} stroke="#6b4423" strokeWidth=".8" />)}
            <rect x={chimneyX - 9} y="20" width="18" height="7" rx="1.5" fill="#57534e" />
            {firing && [0, 1, 2].map((k) => (
              <circle key={k} className="puff" cx={chimneyX + (k - 1) * 3} cy="18" r="6" fill="#78716c" style={{ animationDelay: `${k * 1}s` }} />
            ))}
          </g>

          {/* chambers */}
          {items.map(({ s, p }) => {
            const sel = selected?.index === s.index;
            const isFiring = s.state === 'Firing';
            const show = (on) => (on
              ? setHover({ s, cx: p.x + CW / 2, cy: p.y - DEP })
              : setHover((h) => (h?.s.index === s.index ? null : h)));
            return (
              <g key={s.index} transform={`translate(${p.x},${p.y})`}>
                <g
                  className={`kc st-${s.state}${sel ? ' kc-sel' : ''}`}
                  role="button" tabIndex={0} aria-pressed={sel}
                  aria-label={`${t.section} ${s.index}: ${stateLabel(s)}`}
                  onClick={() => onSelect(s)}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(s); } }}
                  onMouseEnter={() => show(true)} onMouseLeave={() => show(false)}
                  onFocus={() => show(true)} onBlur={() => show(false)}
                >
                  <polygon className="topf" points={p.corner === 'tl' ? `${R},0 ${R + DEP},${-DEP} ${CW + DEP},${-DEP} ${CW},0` : p.corner === 'tr' ? `0,0 ${DEP},${-DEP} ${CW - R + DEP},${-DEP} ${CW - R},0` : `0,0 ${DEP},${-DEP} ${CW + DEP},${-DEP} ${CW},0`} />
                  <polygon className="side" points={p.corner === 'tr' ? `${CW},${R} ${CW + DEP},${R - DEP} ${CW + DEP},${CH - DEP} ${CW},${CH}` : p.corner === 'br' ? `${CW},0 ${CW + DEP},${-DEP} ${CW + DEP},${CH - R - DEP} ${CW},${CH - R}` : `${CW},0 ${CW + DEP},${-DEP} ${CW + DEP},${CH - DEP} ${CW},${CH}`} />
                  <path className="face" d={facePath(p.corner)} />
                  {s.state !== 'Empty' && <path d={facePath(p.corner)} fill="url(#kbricks)" opacity=".22" pointerEvents="none" />}
                  {isFiring && (
                    <g pointerEvents="none">
                      <ellipse className="glow" cx={CW / 2} cy={CH / 2} rx={CW * 0.6} ry={CH * 0.8} fill="url(#kglow)" />
                      {[[CW * 0.3, CH * 0.55], [CW * 0.5, CH * 0.75], [CW * 0.7, CH * 0.5]].map(([xc, h], k) => (
                        <g key={xc}>
                          <polygon className="flame" style={{ animationDelay: `${k * 0.18}s` }} points={flamePts(xc, h)} fill="#f97316" />
                          <polygon className="flame" style={{ animationDelay: `${k * 0.18 + 0.1}s` }} points={flamePts(xc, h * 0.55)} fill="#fde047" />
                        </g>
                      ))}
                    </g>
                  )}
                  <text className="num" x={CW / 2} y={CH / 2 + 4} textAnchor="middle">{s.index}</text>
                  {s.currentLoad > 0 && <text className="load" x={CW - 3} y={CH - 3} textAnchor="end">{Math.round(s.currentLoad / 1000)}k</text>}
                  <path className="ring" d={facePath(p.corner)} />
                </g>
                {isFiring && (
                  <g pointerEvents="none">
                    <rect x={p.col === 'left' ? -48 : CW + DEP + 4} y={CH / 2 - 8} width="44" height="16" rx="8" fill="#dc2626" />
                    <text x={p.col === 'left' ? -26 : CW + DEP + 26} y={CH / 2 + 3.5} fontSize="9" fontWeight="800" fill="#fff" textAnchor="middle">{t.firingState}</text>
                  </g>
                )}
              </g>
            );
          })}
        </svg>

        {hover && (
          <div className="kiln-tip" style={{ left: `${(hover.cx / W) * 100}%`, top: `${(hover.cy / H) * 100}%` }} role="status">
            <strong>{t.section} {hover.s.index}</strong> — {stateLabel(hover.s)}
            {hover.s.currentLoad > 0 && <div>{t.load}: {hover.s.currentLoad.toLocaleString()}</div>}
            {hover.s.loadedAt && <div>{t.loadedAt}: {fmtDateTime(hover.s.loadedAt)}</div>}
          </div>
        )}
      </div>
    </div>
  );
}
