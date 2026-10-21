import { useState } from 'react';

// Advanced SVG Bar Breakdown Chart matching user reference dashboard:
// - Top-center title
// - Values angled above bars
// - Bottom-center checkbox legends
// - Bottom-center totals
export default function BarChart({ items, colors, height = 230, label = 'Grade Breakdown' }) {
  const [activeItems, setActiveItems] = useState(() => items.map((_, i) => i));

  const toggleItem = (idx) => {
    setActiveItems((prev) =>
      prev.includes(idx) ? (prev.length > 1 ? prev.filter((i) => i !== idx) : prev) : [...prev, idx]
    );
  };

  const w = 720;
  const padL = 60;
  const padR = 40;
  const padT = 36;
  const padB = 44;

  const innerW = w - padL - padR;
  const innerH = height - padT - padB;

  const max = Math.max(1, ...items.map((i) => i.value));
  const total = items.reduce((a, b) => a + (Number(b.value) || 0), 0);
  const bw = innerW / (items.length || 1);
  const titleId = `bc-title-${label.replace(/\s+/g, '-')}`;

  // Y-axis grid parameters
  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((pct) => {
    const val = Math.round(pct * max);
    const yPos = padT + innerH - pct * innerH;
    return { val, yPos };
  });

  return (
    <div className="chart-card">
      {/* Top Header: Centered Graph Title (+15% larger) & Top-Right Total Badge */}
      <div className="chart-header-top">
        <div className="chart-header-side-spacer" aria-hidden="true" />
        <div className="chart-title-center-block">
          <h3 className="chart-title-top">
            {label}
          </h3>
        </div>
        <div className="chart-header-right-kpi">
          <div
            className="chart-daily-avg-kpi-badge"
            style={{
              backgroundColor: '#f0fdf4',
              borderColor: '#22c55e',
              color: '#15803d',
            }}
            title={`Total stock across all grades: ${total.toLocaleString()}`}
          >
            <span className="daily-avg-kpi-label">📦 Total:</span>
            <strong className="daily-avg-kpi-val" style={{ color: '#15803d' }}>
              {total.toLocaleString()}
            </strong>
          </div>
        </div>
      </div>

      <div className="chart-scroll-wrap">
        <svg viewBox={`0 0 ${w} ${height}`} className="chart" role="img" aria-labelledby={titleId} style={{ overflow: 'visible' }}>
        <title id={titleId}>{label}: {items.map((i) => `${i.label} ${i.value}`).join(', ')}</title>

        {/* Horizontal Reference Lines & Y-Axis Parameters */}
        {yTicks.map(({ val, yPos }, idx) => (
          <g key={idx}>
            <line
              x1={padL}
              y1={yPos}
              x2={w - padR}
              y2={yPos}
              stroke="#cbd5e1"
              strokeDasharray={idx === 0 ? 'none' : '3 3'}
              strokeWidth="1.1"
            />
            <text
              x={padL - 10}
              y={yPos + 4}
              fontSize="11"
              fontWeight="800"
              fill="#1e293b"
              textAnchor="end"
            >
              {val.toLocaleString()}
            </text>
          </g>
        ))}

        {/* Bars and X-Axis Parameters */}
        {items.map((it, i) => {
          const isVisible = activeItems.includes(i);
          const h = isVisible ? Math.max(4, ((it.value / max) * innerH) || 0) : 0;
          const x = padL + i * bw + bw * 0.08;
          const bar = bw * 0.84;
          const defaultColors = ['#059669', '#0284c7', '#d97706', '#ef4444'];
          const barColor = colors?.[i] || defaultColors[i % defaultColors.length];
          const sharePct = total > 0 ? ((it.value / total) * 100).toFixed(1) : 0;
          const barTopY = padT + innerH - h;

          return (
            <g key={it.label} opacity={isVisible ? 1 : 0.35} style={{ transition: 'opacity 0.2s ease' }}>
              {i > 0 && (
                <line
                  x1={padL + i * bw}
                  y1={padT}
                  x2={padL + i * bw}
                  y2={padT + innerH}
                  stroke="#f1f5f9"
                  strokeWidth="1"
                />
              )}

              {/* Bar */}
              <rect
                x={x}
                y={barTopY}
                width={bar}
                height={h}
                fill={barColor}
                rx="6"
                stroke="rgba(0,0,0,0.12)"
                strokeWidth="1"
              />

              {/* Grade Name & Share % on X-Axis */}
              <text
                x={x + bar / 2}
                y={padT + innerH + 18}
                fontSize="11"
                fontWeight="800"
                fill="#0f172a"
                textAnchor="middle"
              >
                {it.label}
              </text>
              <text
                x={x + bar / 2}
                y={padT + innerH + 31}
                fontSize="9.5"
                fontWeight="700"
                fill="#64748b"
                textAnchor="middle"
              >
                {sharePct}%
              </text>

              {/* Value Parameter displayed slightly diagonal above bar */}
              {isVisible && (
                <text
                  x={x + bar / 2}
                  y={barTopY - 8}
                  transform={`rotate(-35, ${x + bar / 2}, ${barTopY - 8})`}
                  fontSize="10.5"
                  fontWeight="800"
                  fill="#0f172a"
                  textAnchor="start"
                >
                  {Number(it.value).toLocaleString()}
                </text>
              )}
            </g>
          );
        })}
        </svg>
      </div>

      {/* Bottom Center Checkbox Legends */}
      <div className="chart-checkbox-legend-row legend-wrap">
        {items.map((it, idx) => {
          const isChecked = activeItems.includes(idx);
          const barColor = colors?.[idx] || ['#059669', '#0284c7', '#d97706', '#ef4444'][idx % 4]; // same as the bars
          return (
            <label key={it.label} className="chart-checkbox-label">
              <input
                type="checkbox"
                checked={isChecked}
                onChange={() => toggleItem(idx)}
                style={{ accentColor: barColor }}
              />
              <span style={{ color: barColor }}>{it.label}</span>
            </label>
          );
        })}
      </div>

      <div className="chart-date-span-bottom">
        <span>Total: <strong>{total.toLocaleString()}</strong></span>
      </div>

      <table className="visually-hidden">
        <caption>{label}</caption>
        <thead><tr><th>Grade</th><th>Value</th></tr></thead>
        <tbody>{items.map((it) => <tr key={it.label}><td>{it.label}</td><td>{it.value}</td></tr>)}</tbody>
      </table>
    </div>
  );
}

