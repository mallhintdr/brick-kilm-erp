import { useMemo, useState } from 'react';
import { fmtDateTime } from '../api.js';

// Oblique-projection plan of a zig-zag kiln: chambers are 3D blocks laid out in a racetrack
// circuit (top row left->right, bottom row right->left), joined by the fire corridor.
// Section numbering follows the circuit, so index order == the direction the fire travels.
const CW = 40; const CH = 58; const DEP = 8; const GAP = 10;
const PAD = 46; const CORR = 74; const TOP = 96;

const STATE_KEY = {
  Empty: 'empty', Loading: 'loading', Preheating: 'preheating', Firing: 'firingState', Cooling: 'cooling', Unloading: 'unloading',
};

export default function KilnDiagram({ sections, selected, onSelect, t }) {
  const [hover, setHover] = useState(null); // { s, cx, cy }
  const N = sections.length;

  const geo = useMemo(() => {
    const rowLen = Math.ceil(N / 2);
    const pitch = CW + GAP;
    const rowsWidth = rowLen * pitch - GAP;
    const W = PAD * 2 + rowsWidth + DEP;
    const bottomY = TOP + CH + CORR;
    const H = bottomY + CH + 26;
    const pos = (i) => {
      if (i < rowLen) return { x: PAD + i * pitch, y: TOP, row: 'top' };
      const j = i - rowLen; // bottom row runs right -> left
      return { x: PAD + (rowLen - 1 - j) * pitch, y: bottomY, row: 'bottom' };
    };
    const yA = TOP + CH + CORR * 0.32;
    const yB = TOP + CH + CORR * 0.68;
    return { rowLen, rowsWidth, W, H, bottomY, pos, yA, yB, xL: PAD - 2, xR: PAD + rowsWidth + 2 };
  }, [N]);

  if (!N) return null;
  const { W, H, rowsWidth, bottomY, pos, yA, yB, xL, xR } = geo;
  const r = (yB - yA) / 2;
  const firing = sections.some((s) => s.state === 'Firing');
  const chimneyX = PAD + CW / 2;
  const slabTop = TOP - DEP - 16;
  const stateLabel = (s) => t[STATE_KEY[s.state]] || s.state;

  const items = sections
    .map((s, i) => ({ s, p: pos(i) }))
    .sort((a, b) => a.p.y - b.p.y || a.p.x - b.p.x); // paint back-to-front so side faces tuck under neighbours

  const flamePts = (xc, h) => `${xc - 6},${CH - 4} ${xc},${CH - 4 - h} ${xc + 6},${CH - 4}`;

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
          <rect x={PAD - 14} y={slabTop + 6} width={rowsWidth + DEP + 28} height={bottomY + CH - slabTop + 10} rx="18" fill="rgba(28,25,23,.12)" />
          <rect x={PAD - 16} y={slabTop} width={rowsWidth + DEP + 32} height={bottomY + CH - slabTop + 12} rx="18" fill="url(#kslab)" stroke="#b89a68" strokeWidth="1.5" />

          {/* fire corridor: the circuit the fire travels around */}
          <rect x={xL - r - 4} y={yA - 8} width={xR - xL + 2 * r + 8} height={yB - yA + 16} rx={(yB - yA) / 2 + 8} fill="#7c5a3a" opacity=".28" />
          <path
            className="flow" fill="none" stroke={firing ? '#ea580c' : '#a8896a'} strokeWidth="2.5" strokeLinecap="round"
            d={`M${xL} ${yA} H${xR} A${r} ${r} 0 0 1 ${xR} ${yB} H${xL} A${r} ${r} 0 0 1 ${xL} ${yA}`}
          />
          <polygon points={`${W / 2 - 6},${yA - 5} ${W / 2 + 6},${yA} ${W / 2 - 6},${yA + 5}`} fill="#7c5a3a" />
          <polygon points={`${W / 2 + 6},${yB - 5} ${W / 2 - 6},${yB} ${W / 2 + 6},${yB + 5}`} fill="#7c5a3a" />

          {/* chimney + ID fan house */}
          <g>
            <polygon points={`${chimneyX - 10},${slabTop + 4} ${chimneyX - 6},26 ${chimneyX + 6},26 ${chimneyX + 10},${slabTop + 4}`} fill="#8b5e3c" stroke="#6b4423" />
            {[40, 54, 68].map((y) => <line key={y} x1={chimneyX - 8} x2={chimneyX + 8} y1={y} y2={y} stroke="#6b4423" strokeWidth=".8" />)}
            <rect x={chimneyX - 9} y="20" width="18" height="7" rx="1.5" fill="#57534e" />
            {firing && [0, 1, 2].map((k) => (
              <circle key={k} className="puff" cx={chimneyX + (k - 1) * 3} cy="18" r="6" fill="#78716c" style={{ animationDelay: `${k * 1}s` }} />
            ))}
            <rect x={chimneyX + 20} y={slabTop - 14} width="34" height="20" rx="3" fill="#57534e" />
            <text x={chimneyX + 37} y={slabTop} fontSize="9" fontWeight="700" fill="#fff" textAnchor="middle">ID FAN</text>
          </g>

          {/* chambers */}
          {items.map(({ s, p }) => {
            const sel = selected?.index === s.index;
            const isFiring = s.state === 'Firing';
            const show = (on) => (on
              ? setHover({ s, cx: p.x + CW / 2, cy: p.row === 'top' ? p.y - DEP : p.y - DEP })
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
                  <polygon className="topf" points={`0,0 ${DEP},${-DEP} ${CW + DEP},${-DEP} ${CW},0`} />
                  <polygon className="side" points={`${CW},0 ${CW + DEP},${-DEP} ${CW + DEP},${CH - DEP} ${CW},${CH}`} />
                  <rect className="face" width={CW} height={CH} />
                  {s.state !== 'Empty' && <rect width={CW} height={CH} fill="url(#kbricks)" opacity=".22" pointerEvents="none" />}
                  {isFiring && (
                    <g pointerEvents="none">
                      <ellipse className="glow" cx={CW / 2} cy={CH - 14} rx={CW * 0.75} ry="26" fill="url(#kglow)" />
                      {[[10, 22], [20, 32], [30, 20]].map(([xc, h], k) => (
                        <g key={xc}>
                          <polygon className="flame" style={{ animationDelay: `${k * 0.18}s` }} points={flamePts(xc, h)} fill="#f97316" />
                          <polygon className="flame" style={{ animationDelay: `${k * 0.18 + 0.1}s` }} points={flamePts(xc, h * 0.55)} fill="#fde047" />
                        </g>
                      ))}
                    </g>
                  )}
                  <text className="num" x={CW / 2} y="21" textAnchor="middle">{s.index}</text>
                  {s.currentLoad > 0 && <text className="load" x={CW / 2} y={CH - 6} textAnchor="middle">{Math.round(s.currentLoad / 1000)}k</text>}
                  <rect className="ring" width={CW} height={CH} rx="2" />
                </g>
                {isFiring && (
                  <g pointerEvents="none">
                    <rect x={CW / 2 - 21} y={p.row === 'top' ? -DEP - 28 : CH + 8} width="42" height="16" rx="8" fill="#dc2626" />
                    <text x={CW / 2} y={p.row === 'top' ? -DEP - 16.5 : CH + 19.5} fontSize="9" fontWeight="800" fill="#fff" textAnchor="middle">{t.firingState}</text>
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
