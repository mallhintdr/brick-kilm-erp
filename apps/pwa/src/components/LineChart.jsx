import { useId, useState } from 'react';
import { fmtDateDM, fmtDateSpan } from '../api.js';

// Advanced SVG Time-Series Chart matching user reference dashboard:
// - Top-center title
// - X-axis dates formatted as dd-mm
// - Dashed daily average line with benchmark pill
// - Bottom-center checkbox legends
// - Bottom-center start date and end date span (e.g. 23-4-25 to 23-4-26)
export default function LineChart({ data, x, y, color = '#8b5cf6', height = 250, format = (v) => v, label }) {
  const gradId = useId().replace(/:/g, '');
  const [hoverIndex, setHoverIndex] = useState(null);
  const [showSeries, setShowSeries] = useState(true);
  const [showAvgLine, setShowAvgLine] = useState(true);

  if (!data || !data.length) {
    return <p className="muted" style={{ padding: '1rem', textAlign: 'center' }}>No historical data available</p>;
  }

  const w = 720;
  const padL = 60; // room for Y-axis parameter labels
  const padR = 40; // room for right edge
  const padT = 36; // room for top peak values
  const padB = 40; // room for X-axis dd-mm labels

  const innerW = w - padL - padR;
  const innerH = height - padT - padB;

  const ys = data.map((d) => Number(d[y]) || 0);
  const min = Math.min(...ys);
  const max = Math.max(1, ...ys);
  const avg = ys.reduce((a, b) => a + b, 0) / (ys.length || 1);

  const sx = (i) => padL + (i / Math.max(1, data.length - 1)) * innerW;
  const sy = (v) => padT + innerH - ((v - min) / (max - min || 1)) * innerH;

  const linePoints = data.map((d, i) => `${i ? 'L' : 'M'}${sx(i).toFixed(1)},${sy(Number(d[y]) || 0).toFixed(1)}`).join(' ');
  const areaPoints = `${linePoints} L${sx(data.length - 1).toFixed(1)},${padT + innerH} L${sx(0).toFixed(1)},${padT + innerH} Z`;

  // Horizontal Grid Lines & Y-Axis Parameters (5 steps)
  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((pct) => {
    const val = min + pct * (max - min);
    return { val, yPos: sy(val) };
  });

  // Vertical Grid Lines & X-Axis Date Parameters (dd-mm format)
  const numDateTicks = Math.min(6, data.length);
  const xTicks = [];
  if (data.length <= 6) {
    data.forEach((d, i) => xTicks.push({ idx: i, date: fmtDateDM(d[x]), xPos: sx(i) }));
  } else {
    for (let k = 0; k < numDateTicks; k++) {
      const idx = Math.round((k / (numDateTicks - 1)) * (data.length - 1));
      xTicks.push({ idx, date: fmtDateDM(data[idx][x]), xPos: sx(idx) });
    }
  }

  const firstDate = data[0][x];
  const lastDate = data[data.length - 1][x];
  const dateSpanStr = `${fmtDateSpan(firstDate)} to ${fmtDateSpan(lastDate)}`;
  const chartLabel = label || `${y} trend`;
  const titleId = `lc-title-${y}-${gradId}`;

  const activeIdx = hoverIndex !== null ? hoverIndex : data.length - 1;
  const activeItem = data[activeIdx];
  const activeVal = Number(activeItem?.[y]) || 0;
  const activeX = sx(activeIdx);
  const activeY = sy(activeVal);

  const avgY = sy(avg);
  const step = data.length > 32 ? 3 : data.length > 18 ? 2 : 1;

  return (
    <div className="chart-card">
      {/* Top Center Graph Title */}
      <h3 className="chart-title-top">
        {chartLabel}
      </h3>

      <svg viewBox={`0 0 ${w} ${height}`} className="chart" role="img" aria-labelledby={titleId} style={{ overflow: 'visible' }}>
        <title id={titleId}>{chartLabel}: {dateSpanStr}</title>
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.28" />
            <stop offset="90%" stopColor={color} stopOpacity="0.02" />
          </linearGradient>
        </defs>

        {/* Horizontal Grid Lines & Y-Axis Parameter Labels */}
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
              {Math.round(val).toLocaleString()}
            </text>
          </g>
        ))}

        {/* Vertical Grid Lines & X-Axis Date Parameters (dd-mm) */}
        {xTicks.map(({ date, xPos }, idx) => (
          <g key={idx}>
            <line
              x1={xPos}
              y1={padT}
              x2={xPos}
              y2={padT + innerH}
              stroke="#e2e8f0"
              strokeDasharray="3 3"
              strokeWidth="1"
            />
            <text
              x={xPos}
              y={padT + innerH + 18}
              fontSize="11"
              fontWeight="800"
              fill="#334155"
              textAnchor="middle"
            >
              {date}
            </text>
          </g>
        ))}

        {/* Dashed Horizontal Daily Average Line & Pill (matching user screenshot) */}
        {showAvgLine && (
          <g>
            <line
              x1={padL}
              y1={avgY}
              x2={w - padR}
              y2={avgY}
              stroke="#ea580c"
              strokeDasharray="5 4"
              strokeWidth="1.8"
            />
            <rect
              x={(w / 2) - 55}
              y={avgY - 11}
              width="110"
              height="20"
              rx="10"
              fill="#fff7ed"
              stroke="#ea580c"
              strokeWidth="1.3"
            />
            <text
              x={w / 2}
              y={avgY + 3}
              fontSize="10"
              fontWeight="800"
              fill="#c2410c"
              textAnchor="middle"
            >
              Daily Avg: {Math.round(avg).toLocaleString()}
            </text>
          </g>
        )}

        {/* Area fill */}
        {showSeries && <path d={areaPoints} fill={`url(#${gradId})`} />}

        {/* Main line */}
        {showSeries && (
          <path
            d={linePoints}
            fill="none"
            stroke={color}
            strokeWidth="2.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}

        {/* Data point indicators & Diagonal Data Numbers */}
        {showSeries && data.map((d, i) => {
          const cx = sx(i);
          const valNum = Number(d[y]) || 0;
          const cy = sy(valNum);
          const showDiag = i % step === 0 || i === data.length - 1;

          return (
            <g key={i}>
              <circle
                cx={cx}
                cy={cy}
                r={hoverIndex === i ? 6 : 3.5}
                fill={color}
                stroke="#ffffff"
                strokeWidth="1.5"
                style={{ cursor: 'pointer', transition: 'r 0.15s ease' }}
                onMouseEnter={() => setHoverIndex(i)}
                onMouseLeave={() => setHoverIndex(null)}
                onTouchStart={() => setHoverIndex(i)}
              />

              {showDiag && (
                <text
                  x={cx}
                  y={cy - 9}
                  transform={`rotate(-35, ${cx}, ${cy - 9})`}
                  fontSize="10"
                  fontWeight="800"
                  fill="#0f172a"
                  textAnchor="start"
                  pointerEvents="none"
                >
                  {Math.round(valNum).toLocaleString()}
                </text>
              )}

              <circle
                cx={cx}
                cy={cy}
                r="16"
                fill="transparent"
                style={{ cursor: 'pointer' }}
                onMouseEnter={() => setHoverIndex(i)}
                onMouseLeave={() => setHoverIndex(null)}
                onTouchStart={() => setHoverIndex(i)}
              />
            </g>
          );
        })}

        {/* Active Node Cursor and Value Pill */}
        {showSeries && (
          <g pointerEvents="none">
            <line
              x1={activeX}
              y1={padT}
              x2={activeX}
              y2={padT + innerH}
              stroke={color}
              strokeWidth="1.5"
              strokeDasharray="2 2"
            />
            <circle cx={activeX} cy={activeY} r="7" fill={color} opacity="0.3" />
            <circle cx={activeX} cy={activeY} r="4.5" fill={color} stroke="#fff" strokeWidth="2" />

            <rect
              x={Math.min(w - padR - 85, Math.max(padL, activeX - 42))}
              y={Math.max(6, activeY - 30)}
              width="85"
              height="22"
              rx="6"
              fill="#0f172a"
              stroke="rgba(255,255,255,0.2)"
              strokeWidth="1"
            />
            <text
              x={Math.min(w - padR - 85, Math.max(padL, activeX - 42)) + 42}
              y={Math.max(6, activeY - 30) + 15}
              fontSize="11"
              fontWeight="800"
              fill="#ffffff"
              textAnchor="middle"
            >
              {Math.round(activeVal).toLocaleString()}
            </text>
          </g>
        )}
      </svg>

      {/* Bottom Center Checkbox Legends (matching user screenshots) */}
      <div className="chart-checkbox-legend-row">
        <label className="chart-checkbox-label">
          <input
            type="checkbox"
            checked={showSeries}
            onChange={(e) => setShowSeries(e.target.checked)}
            style={{ accentColor: color }}
          />
          <span className="chart-legend-box" style={{ background: color }} />
          <span>{chartLabel}</span>
        </label>

        <label className="chart-checkbox-label">
          <input
            type="checkbox"
            checked={showAvgLine}
            onChange={(e) => setShowAvgLine(e.target.checked)}
            style={{ accentColor: '#ea580c' }}
          />
          <span className="chart-legend-box" style={{ background: '#ea580c' }} />
          <span>Daily Avg: {Math.round(avg).toLocaleString()}</span>
        </label>
      </div>

      {/* Bottom Center Date Range Span (e.g. 23-4-25 to 23-4-26) */}
      <div className="chart-date-span-bottom">
        <span>📅 {dateSpanStr}</span>
      </div>

      <table className="visually-hidden">
        <caption>{chartLabel}</caption>
        <thead><tr><th>{x}</th><th>{y}</th></tr></thead>
        <tbody>
          {data.map((d, i) => <tr key={i}><td>{fmtDateDM(d[x])}</td><td>{format(Number(d[y]) || 0)}</td></tr>)}
        </tbody>
      </table>
    </div>
  );
}

