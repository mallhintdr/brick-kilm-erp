import { useId, useState } from 'react';
import { fmtDateDM, fmtDateSpan } from '../api.js';

// Advanced SVG Time-Series Chart matching user reference dashboard:
// - Top-center title
// - X-axis dates formatted as dd-mm
// - Dashed daily average line with benchmark pill
// - Bottom-center checkbox legends
// - Bottom-center start date and end date span (e.g. 23-4-25 to 23-4-26)
// Advanced SVG Time-Series Chart matching user reference dashboard:
// - Top-center title with contrasted Daily Average callout badge
// - Zero-based baseline ensuring all daily bars are prominently displayed
// - Headroom ensuring peak values and angled data labels never touch the top boundary
// - Slot-centered coordinates so bars and line nodes are perfectly centered and spaced
// - High-contrast Daily Average dashed benchmark line and pill rendered over the top layer
// - Bottom-center checkbox legends with matching contrast colors
// - Bottom-center start date and end date span (e.g. 23-4-25 to 23-4-26)

function getContrastAvg(seriesColor) {
  const c = (seriesColor || '').toLowerCase();
  // If series is orange/amber (Moulding etc) -> contrast with deep Royal Blue
  if (c.includes('ea580c') || c.includes('d97706') || c.includes('f59e0b') || c.includes('orange')) {
    return {
      stroke: '#1d4ed8', // Royal Blue
      bg: '#eff6ff',
      border: '#60a5fa',
      text: '#1e40af',
    };
  }
  // If series is green (Quality Awwal etc) -> contrast with vibrant Orange
  if (c.includes('059669') || c.includes('10b981') || c.includes('16a34a') || c.includes('green')) {
    return {
      stroke: '#ea580c', // Bright Orange
      bg: '#fff7ed',
      border: '#fb923c',
      text: '#c2410c',
    };
  }
  // If series is red (Fuel/Coal etc) -> contrast with vibrant Emerald Green
  if (c.includes('dc2626') || c.includes('ef4444') || c.includes('f43f5e') || c.includes('red')) {
    return {
      stroke: '#059669', // Emerald Green
      bg: '#ecfdf5',
      border: '#34d399',
      text: '#065f46',
    };
  }
  // If series is blue (Sales/Revenue etc) -> contrast with warm Amber Gold
  if (c.includes('0284c7') || c.includes('2563eb') || c.includes('3b82f6') || c.includes('blue')) {
    return {
      stroke: '#d97706', // Warm Amber Gold
      bg: '#fffbeb',
      border: '#f59e0b',
      text: '#b45309',
    };
  }
  // Fallback (for purple/etc) -> vibrant Orange
  return {
    stroke: '#ea580c',
    bg: '#fff7ed',
    border: '#fb923c',
    text: '#c2410c',
  };
}

// Catmull-Rom cubic Bezier smoothing for a silky smooth, thin trend curve
function getSmoothSpline(pts) {
  if (!pts || pts.length <= 1) return '';
  if (pts.length === 2) return `M ${pts[0].x.toFixed(1)},${pts[0].y.toFixed(1)} L ${pts[1].x.toFixed(1)},${pts[1].y.toFixed(1)}`;
  let path = `M ${pts[0].x.toFixed(1)},${pts[0].y.toFixed(1)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i === 0 ? 0 : i - 1];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2 < pts.length ? i + 2 : i + 1];
    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;
    path += ` C ${cp1x.toFixed(1)},${cp1y.toFixed(1)} ${cp2x.toFixed(1)},${cp2y.toFixed(1)} ${p2.x.toFixed(1)},${p2.y.toFixed(1)}`;
  }
  return path;
}

export default function LineChart({ data, x, y, color = '#8b5cf6', height = 270, format = (v) => v, label }) {
  const gradId = useId().replace(/:/g, '');
  const [hoverIndex, setHoverIndex] = useState(null);
  const [showBars, setShowBars] = useState(true);
  const [showTrend, setShowTrend] = useState(true);

  if (!data || !data.length) {
    return <p className="muted" style={{ padding: '1rem', textAlign: 'center' }}>No historical data available</p>;
  }

  const w = 720;
  const padL = 60; // room for Y-axis parameter labels
  const padR = 40; // room for right edge
  const padT = 36; // room for top peak values and pills
  const padB = 48; // room for diagonal X-axis dd-mm labels

  const innerW = w - padL - padR;
  const innerH = height - padT - padB;

  const ys = data.map((d) => Number(d[y]) || 0);
  const rawMax = Math.max(0, ...ys);
  // Give 15% headroom above highest value so bars have clear breathing room
  const max = rawMax > 0 ? rawMax * 1.15 : 10;
  const avg = ys.reduce((a, b) => a + b, 0) / (ys.length || 1);

  // Zero-based Y-axis scale: ALL quantities start from 0 at the bottom axis!
  const sy = (v) => padT + innerH - (Math.max(0, Number(v) || 0) / max) * innerH;

  // Slot-centered X-axis mapping: each data point sits cleanly in its slot
  const n = data.length || 1;
  const slotW = innerW / n;
  const sx = (i) => padL + (i + 0.5) * slotW;
  const barWidth = Math.max(6, Math.min(32, slotW * 0.72));

  // Linear Regression Trend calculation for percentage trajectory
  let trendPct = 0;
  if (data.length > 1) {
    const xBar = (data.length - 1) / 2;
    const yBar = avg;
    let num = 0;
    let den = 0;
    for (let i = 0; i < data.length; i++) {
      const xDiff = i - xBar;
      const yVal = Number(data[i][y]) || 0;
      num += xDiff * (yVal - yBar);
      den += xDiff * xDiff;
    }
    const slope = den !== 0 ? num / den : 0;
    const intercept = yBar - slope * xBar;
    const trendStart = Math.max(0, intercept);
    const trendEnd = Math.max(0, slope * (data.length - 1) + intercept);
    trendPct = yBar > 0 ? ((trendEnd - trendStart) / yBar) * 100 : 0;
  }
  const trendColor = '#6366f1'; // Vibrant Indigo Trend Line

  // Smoother, thinner trend curve generated using local moving average spline
  const smoothTrendPts = data.map((d, i) => {
    const yCurr = Number(d[y]) || 0;
    const yPrev = i > 0 ? Number(data[i - 1][y]) || 0 : yCurr;
    const yNext = i < data.length - 1 ? Number(data[i + 1][y]) || 0 : yCurr;
    const valSmoothed = (yPrev + 2 * yCurr + yNext) / 4;
    return {
      x: sx(i),
      y: sy(valSmoothed),
    };
  });
  const smoothTrendPath = getSmoothSpline(smoothTrendPts);

  // Horizontal Grid Lines & Y-Axis Parameters (5 reference steps starting from 0)
  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((pct) => {
    const val = Math.round(pct * rawMax);
    const yPos = sy(pct * rawMax);
    return { val, yPos };
  });

  // Vertical Grid Lines & X-Axis Date Parameters (dd-mm format)
  const numDateTicks = Math.min(8, data.length);
  const xTicks = [];
  if (data.length <= 8) {
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
  // Keep average pill safely within visible plot boundaries
  const clampedAvgY = Math.max(padT + 13, Math.min(padT + innerH - 13, avgY));

  // Contrasting color palette tailored for this series color
  const contrast = getContrastAvg(color);

  return (
    <div className="chart-card">
      {/* Top Header: Centered Graph Title, Trend Badge & Contrasting Daily Avg Callout */}
      <div className="chart-header-top">
        <h3 className="chart-title-top">
          {chartLabel}
        </h3>
        <div className="chart-header-badges">
          {/* Trend Badge */}
          <div
            className="chart-trend-badge-top"
            style={{
              backgroundColor: '#eef2ff',
              borderColor: '#818cf8',
              color: '#4338ca',
            }}
            title={`Overall trend trajectory: ${trendPct >= 0 ? '+' : ''}${trendPct.toFixed(1)}%`}
          >
            <span className="trend-badge-icon">{trendPct >= 0 ? '📈' : '📉'}</span>
            <span className="trend-badge-label">Trend:</span>
            <strong className="trend-badge-val">
              {trendPct >= 0 ? '+' : ''}{trendPct.toFixed(1)}%
            </strong>
          </div>

          {/* Daily Average Callout */}
          <div
            className="chart-avg-badge-top"
            style={{
              backgroundColor: contrast.bg,
              borderColor: contrast.border,
              color: contrast.text,
            }}
            title={`Average across selected period: ${format(Math.round(avg))}`}
          >
            <span className="avg-badge-icon" style={{ color: contrast.stroke }}>⚡</span>
            <span className="avg-badge-label">Daily Avg:</span>
            <strong className="avg-badge-val" style={{ color: contrast.stroke }}>
              {format(Math.round(avg))}
            </strong>
          </div>
        </div>
      </div>

      {/* Top Center Date Range Span (below graph title header in slightly larger size) */}
      <div className="chart-date-span-top">
        📅 {dateSpanStr}
      </div>

      <svg viewBox={`0 0 ${w} ${height}`} className="chart" role="img" aria-labelledby={titleId} style={{ overflow: 'visible' }}>
        <title id={titleId}>{chartLabel}: {dateSpanStr}</title>
        <defs>
          <linearGradient id={`${gradId}-bar`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.95" />
            <stop offset="100%" stopColor={color} stopOpacity="0.70" />
          </linearGradient>
          <filter id={`${gradId}-pill-shadow`} x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="2" stdDeviation="3.5" floodColor="#0f172a" floodOpacity="0.32" />
          </filter>
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
              {val.toLocaleString()}
            </text>
          </g>
        ))}

        {/* Vertical Grid Lines & DIAGONAL X-Axis Date Parameters (dd-mm) */}
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
              y={padT + innerH + 12}
              transform={`rotate(-40, ${xPos}, ${padT + innerH + 12})`}
              fontSize="10.5"
              fontWeight="800"
              fill="#334155"
              textAnchor="end"
            >
              {date}
            </text>
          </g>
        ))}

        {/* DAILY BARS: Primary visual data representation for all daily data (no diagonal labels on bars) */}
        {showBars && data.map((d, i) => {
          const cx = sx(i);
          const valNum = Number(d[y]) || 0;
          const cy = sy(valNum);
          const barH = Math.max(valNum > 0 ? 3 : 0, padT + innerH - cy);
          const bx = cx - barWidth / 2;
          const isHovered = hoverIndex === i;

          return (
            <g key={`bar-${i}`}>
              <rect
                x={bx}
                y={padT + innerH - barH}
                width={barWidth}
                height={barH}
                fill={`url(#${gradId}-bar)`}
                stroke={color}
                strokeWidth={isHovered ? '2' : '1.2'}
                strokeOpacity={isHovered ? '1' : '0.85'}
                rx={Math.min(4, barWidth / 3)}
                ry={Math.min(4, barWidth / 3)}
                opacity={isHovered ? 1 : 0.9}
                style={{ cursor: 'pointer', transition: 'all 0.15s ease' }}
                onMouseEnter={() => setHoverIndex(i)}
                onMouseLeave={() => setHoverIndex(null)}
                onTouchStart={() => setHoverIndex(i)}
              />

              {/* Touch/Click Target Area for this bar */}
              <rect
                x={cx - slotW / 2}
                y={padT}
                width={slotW}
                height={innerH}
                fill="transparent"
                style={{ cursor: 'pointer' }}
                onMouseEnter={() => setHoverIndex(i)}
                onMouseLeave={() => setHoverIndex(null)}
                onTouchStart={() => setHoverIndex(i)}
              />
            </g>
          );
        })}

        {/* TREND LINE: Smoother and thinner statistical curve across the bars */}
        {showTrend && smoothTrendPath && (
          <g className="chart-trend-group" pointerEvents="none">
            <path
              d={smoothTrendPath}
              fill="none"
              stroke={trendColor}
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity="0.9"
            />
          </g>
        )}

        {/* OVER THE TOP: High-contrast Dashed Horizontal Daily Average Line & Pill Badge (Displayed directly on graph) */}
        <g pointerEvents="none" className="chart-avg-top-layer">
          {/* Contrasting dashed benchmark line across full width */}
          <line
            x1={padL}
            y1={avgY}
            x2={w - padR}
            y2={avgY}
            stroke={contrast.stroke}
            strokeDasharray="6 4"
            strokeWidth="2.5"
          />
          {/* Contrasting Pill Badge rendered over the top layer with shadow for outstanding visibility */}
          <g transform={`translate(${w / 2}, ${clampedAvgY})`}>
            <rect
              x="-78"
              y="-13"
              width="156"
              height="26"
              rx="13"
              fill={contrast.stroke}
              stroke="#ffffff"
              strokeWidth="2.2"
              filter={`url(#${gradId}-pill-shadow)`}
            />
            <text
              x="0"
              y="5"
              fontSize="11.5"
              fontWeight="900"
              fill="#ffffff"
              letterSpacing="0.02em"
              textAnchor="middle"
            >
              Daily Avg: {format(Math.round(avg))}
            </text>
          </g>
        </g>

        {/* Compact Info Popup (30% opaque fill) on clicking / hovering on graph */}
        {hoverIndex !== null && activeItem && (
          <g pointerEvents="none" className="chart-tooltip-group">
            <line
              x1={activeX}
              y1={padT}
              x2={activeX}
              y2={padT + innerH}
              stroke={color}
              strokeWidth="1.2"
              strokeDasharray="2 2"
              opacity="0.8"
            />
            <circle cx={activeX} cy={activeY} r="5.5" fill={color} opacity="0.3" />
            <circle cx={activeX} cy={activeY} r="3.5" fill={color} stroke="#fff" strokeWidth="1.5" />

            {/* Compact popup: 30% opaque fill */}
            <rect
              x={Math.min(w - padR - 74, Math.max(padL, activeX - 37))}
              y={Math.max(6, activeY - 26)}
              width="74"
              height="20"
              rx="4"
              fill="rgba(15, 23, 42, 0.30)"
              stroke="rgba(15, 23, 42, 0.70)"
              strokeWidth="1"
            />
            <text
              x={Math.min(w - padR - 74, Math.max(padL, activeX - 37)) + 37}
              y={Math.max(6, activeY - 26) + 14}
              fontSize="10.5"
              fontWeight="900"
              fill="#0f172a"
              textAnchor="middle"
            >
              {format(Math.round(activeVal))}
            </text>
          </g>
        )}
      </svg>

      {/* Bottom Center Checkbox Legends: Bars & Trend Line (Daily Avg displayed on graph, not in legend) */}
      <div className="chart-checkbox-legend-row">
        <label className="chart-checkbox-label">
          <input
            type="checkbox"
            checked={showBars}
            onChange={(e) => setShowBars(e.target.checked)}
            style={{ accentColor: color }}
          />
          <span className="chart-legend-box" style={{ background: color, borderRadius: '2px' }} />
          <span>{chartLabel} (Bars)</span>
        </label>

        <label className="chart-checkbox-label">
          <input
            type="checkbox"
            checked={showTrend}
            onChange={(e) => setShowTrend(e.target.checked)}
            style={{ accentColor: trendColor }}
          />
          <span className="chart-legend-box" style={{ background: trendColor, height: '3px', borderRadius: '2px' }} />
          <span style={{ fontWeight: 800, color: trendColor }}>
            {trendPct >= 0 ? '📈' : '📉'} Trend Line ({trendPct >= 0 ? '+' : ''}{trendPct.toFixed(1)}%)
          </span>
        </label>
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

