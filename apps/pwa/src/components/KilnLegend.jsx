import { LINE_FILL } from './LineDiagram.jsx';

// The state cards above a kiln plan: how many lines/chambers are in each state, in the plan's colours.
const STATES = [['Empty', 'empty'], ['Loading', 'loading'], ['Preheating', 'preheating'], ['Firing', 'firingState'], ['Cooling', 'cooling'], ['Ready', 'readyToUnload'], ['Unloading', 'unloading']];

export default function KilnLegend({ rows, t, states }) {
  const shown = states ? STATES.filter(([s]) => states.includes(s)) : STATES;
  return (
    <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-7">
      {shown.map(([st, key]) => {
        const c = LINE_FILL[st];
        const count = rows.filter((r) => r.state === st).length;
        return (
          <div key={st} className="flex min-w-0 flex-col items-center justify-center rounded-lg px-1 py-1.5 text-center ring-1"
            style={{ background: `color-mix(in srgb, ${c} 16%, #fff)`, '--tw-ring-color': `color-mix(in srgb, ${c} 55%, #fff)` }}>
            <span className="w-full truncate text-2xs font-semibold text-n-700">{t[key]}</span>
            <b className="text-lg font-extrabold tabular-nums" style={{ color: `color-mix(in srgb, ${c} 70%, #1c1917)` }}>{count}</b>
          </div>
        );
      })}
    </div>
  );
}
