import { useMemo } from 'react';

// Plan of a line kiln as one continuous loop (a racetrack): line 1 sits at the middle of the top
// curve and the lines run counter-clockwise, evenly spaced, down the left, round the bottom and up the
// left, so line 240 meets line 1 again. Each line is a strip across the kiln, coloured by state.
const PITCH = 40;      // distance between line centres along the loop
const THICK = 34;      // strip thickness (along the loop)
const BAND = 170;      // strip length (across the kiln)
const MARGIN = 20;

// short date / time for the small writing inside a line
const dm = (x) => { if (!x) return ''; const d = new Date(x); return `${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}`; };

// Line colours: unfired bricks green (lighter while just loaded, deeper once preheating), fire red,
// fired bricks gold (cooling: deeper gold with a green dot; ready to unload: light yellow), nikasi blue.
export const LINE_FILL = {
  Empty: '#e2e8f0',
  Loading: '#4ade80',
  Preheating: '#16a34a',
  Firing: '#ef4444',
  Cooling: '#d4a017',   // hot, right behind the fire
  Ready: '#fde68a',     // fired and cooled enough for nikasi
  Unloading: '#3b82f6',
};
const STATE_KEY = { Empty: 'empty', Loading: 'loading', Preheating: 'preheating', Firing: 'firingState', Cooling: 'cooling', Ready: 'readyToUnload', Unloading: 'unloading' };

// The one date written inside a line: when its current stage started.
function stageDate(l, mode) {
  switch (l.state) {
    case 'Loading': return l.loadedAt;
    case 'Preheating': return l.preheatedAt || l.loadedAt;
    case 'Firing': return l.firedAt;
    case 'Cooling': return l.cooledAt || l.firedAt;
    case 'Ready': return l.cooledAt || l.firedAt;
    case 'Unloading': return l.unloadStartedAt;
    default: return mode === 'unload' ? l.last?.unloadedAt : null; // empty: when it was emptied
  }
}

export default function LineDiagram({ lines, selected, onSelect, t, fireIndex, mode = 'fire' }) {
  const geo = useMemo(() => {
    const N = lines.length || 1;
    const P = N * PITCH;
    let R = 120;
    let S = (P - 2 * Math.PI * R) / 2;
    if (S < 0) { R = P / (2 * Math.PI); S = 0; }
    const half = R + BAND / 2;
    const W = 2 * (half + MARGIN);
    const Cx = W / 2;
    const Cy1 = MARGIN + half;
    const Cy2 = Cy1 + S;
    const H = Cy2 + half + MARGIN;
    const qa = (Math.PI * R) / 2; // quarter arc
    // centre point and the direction across the kiln (degrees) at distance d along the loop
    const at = (d) => {
      let x; let y; let ang;
      if (d < qa) { ang = -90 + (d / qa) * 90; }
      else if (d < qa + S) { return { x: Cx + R, y: Cy1 + (d - qa), ang: 0 }; }
      else if (d < qa + S + 2 * qa) { ang = ((d - qa - S) / (2 * qa)) * 180; const r = (ang * Math.PI) / 180; return { x: Cx + R * Math.cos(r), y: Cy2 + R * Math.sin(r), ang }; }
      else if (d < 3 * qa + 2 * S) { return { x: Cx - R, y: Cy2 - (d - 3 * qa - S), ang: 180 }; }
      else { ang = 180 + ((d - 3 * qa - 2 * S) / qa) * 90; }
      const r = (ang * Math.PI) / 180;
      x = Cx + R * Math.cos(r); y = Cy1 + R * Math.sin(r);
      return { x, y, ang };
    };
    const loop = (r) => `M${Cx} ${Cy1 - r}A${r} ${r} 0 0 1 ${Cx + r} ${Cy1}L${Cx + r} ${Cy2}A${r} ${r} 0 0 1 ${Cx - r} ${Cy2}L${Cx - r} ${Cy1}A${r} ${r} 0 0 1 ${Cx} ${Cy1 - r}Z`;
    return { N, W, H, Cx, Cy1, Cy2, R, at, loop };
  }, [lines.length]);

  if (!lines.length) return null;
  const { W, H, Cx, Cy1, Cy2, R, at, loop } = geo;
  const stateLabel = (st) => t[STATE_KEY[st]] || st;
  const outer = R + BAND / 2 + 7;
  const inner = Math.max(R - BAND / 2 - 7, 10);

  return (
    <div className="kiln-scroll">
      <div className="kiln kiln-lines">
        <svg viewBox={`0 0 ${W} ${H}`} role="group" aria-label={t.kilnBoard}>
          {/* kiln body: a brick ring with the open ground in the middle */}
          <path d={loop(outer)} fill="#e9d8b8" stroke="#b89a68" strokeWidth="2" />
          <path d={loop(inner)} fill="#f8fafc" stroke="#b89a68" strokeWidth="2" />
          {/* chimney in the middle of the ground, with the direction of the fire */}
          <g transform={`translate(${Cx} ${(Cy1 + Cy2) / 2})`} className="loop-centre">
            <polygon points="-14,40 -8,-40 8,-40 14,40" fill="#8b5e3c" stroke="#6b4423" strokeWidth="2" />
            <rect x="-11" y="-48" width="22" height="9" rx="2" fill="#57534e" />
            <text y="74" textAnchor="middle" className="loop-dir">{t.clockwise} ↺</text>
          </g>
          {lines.map((l, i) => {
            const q = at(i * PITCH); // line 1 sits exactly at the middle of the top curve
            const p = { x: 2 * Cx - q.x, y: q.y, ang: 180 - q.ang }; // mirrored: lines run counter-clockwise
            const sel = selected?.index === l.index;
            // writing runs along the line and stays upright (the strip looks the same turned round)
            let up = ((p.ang % 360) + 360) % 360;
            if (up > 90 && up < 270) up -= 180;
            const date = stageDate(l, mode);
            // line number inside the strip, close to the outer edge of the kiln
            const r = (p.ang * Math.PI) / 180;
            const off = BAND / 2 - 13; // inside the strip, near its outer end
            return (
              <g key={l.index} transform={`translate(${p.x.toFixed(1)} ${p.y.toFixed(1)}) rotate(${up.toFixed(1)})`}>
                <rect
                  className={`line-strip st-${l.state}${sel ? ' line-sel' : ''}${fireIndex === l.index ? ' fire-now' : ''}`}
                  x={-BAND / 2} y={-THICK / 2} width={BAND} height={THICK} rx="3"
                  fill={LINE_FILL[l.state] || LINE_FILL.Empty}
                  data-index={l.index}
                  role="button" tabIndex={0} aria-pressed={sel}
                  aria-label={`${t.line} ${l.index}: ${stateLabel(l.state)}`}
                  onClick={() => onSelect(l)}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(l); } }}
                >
                  <title>{`${t.line} ${l.index} — ${stateLabel(l.state)}${l.currentLoad ? ` — ${l.currentLoad.toLocaleString()}` : ''}`}</title>
                </rect>
                {l.state === 'Cooling' && <circle cx={-BAND / 2 + 30} cy="0" r="4.5" fill="#16a34a" stroke="#fff" strokeWidth="1.2" pointerEvents="none" />}
                {date && <text className="line-info" x="0" y="0" textAnchor="middle" pointerEvents="none" dominantBaseline="central">{dm(date)}</text>}
                <text className="line-num line-num-out" pointerEvents="none" textAnchor="middle" dominantBaseline="central"
                  transform={`rotate(${(-up).toFixed(1)}) translate(${(Math.cos(r) * off).toFixed(1)} ${(Math.sin(r) * off).toFixed(1)})`}>{l.index}</text>
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}
