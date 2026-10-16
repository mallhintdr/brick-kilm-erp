// Bhatta (kiln) chimney: tall, tapering towards the top, thin outline with brick courses, a cap,
// smoke drifting up, and the kiln mound standing on the bottom edge. Same drawing as public/icon.svg.
// The burst prop: change it (e.g. to Date.now()) to make the chimney pour out a thick cloud for a moment.
export default function KilnLogo({ size = 24, color = '#ffffff', smoke = true, title, burst }) {
  return (
    <svg viewBox="0 0 32 32" width={size} height={size} fill="none" stroke={color} strokeWidth="1.1"
      strokeLinecap="round" strokeLinejoin="round" role={title ? 'img' : undefined} aria-hidden={title ? undefined : 'true'}
      className="kiln-logo" style={{ overflow: 'visible' }}>
      {title && <title>{title}</title>}
      {smoke && (
        <g className="kiln-logo-smoke" strokeWidth="0.95">
          <path className="puff p1" d="M16.4 3.9c-1.3-.1-1.7-1.5-.8-2.2.2-1.2 1.8-1.5 2.4-.6 1.1-.3 1.9.8 1.3 1.7.1 1-1.1 1.4-1.8.8" />
          <path className="puff p2" d="M19.6 2c-.7-.5-.4-1.6.5-1.6.4-.7 1.5-.6 1.7.2.8.1.9 1.1.2 1.4-.3.5-1.1.5-1.4.1" />
          <path className="puff p3" d="M22.6.9c-.4-.3-.2-.9.3-.9" />
        </g>
      )}
      {burst && (
        // thick cloud: billows out for 1s, then rises and fades over 2s (keyed so every tap replays it)
        <g key={burst} className="kiln-logo-burst" strokeWidth="0.9">
          <path className="b b1" d="M14.2 3.6c-2.4-.2-3.2-2.8-1.4-4.1.4-2.3 3.4-2.9 4.5-1.1 2.1-.6 3.6 1.4 2.5 3.2.3 1.9-2.1 2.7-3.4 1.5-.7.6-1.6.7-2.2.5z" />
          <path className="b b2" d="M18.4 1.2c-1.8-.3-2.1-2.4-.7-3.2.5-1.6 2.7-1.8 3.4-.5 1.6-.2 2.5 1.4 1.6 2.6 0 1.4-1.8 1.9-2.7 1z" />
          <path className="b b3" d="M11.6 1.4c-1.6-.2-2-2.1-.7-2.9.4-1.4 2.4-1.6 3-.4 1.4-.2 2.2 1.2 1.4 2.3 0 1.2-1.6 1.7-2.4.9z" />
          <path className="b b4" d="M21.8-1.4c-1.2-.4-1.2-2 0-2.4.6-1 2.1-.8 2.4.3 1.1.3 1.2 1.7.2 2.1-.6.6-1.6.6-2.1.1z" />
          <path className="b b5" d="M15.6-2.6c-1.3-.3-1.4-2-.2-2.5.5-1.1 2.2-1.1 2.6 0 1.1.1 1.4 1.6.4 2.1-.5.7-1.6.8-2.2.3z" />
        </g>
      )}
      <path d="M14.1 4h3.8v1.2h-3.8zM14.6 5.2h2.8" />
      <path d="M14.6 5.2 11.37 29.2M17.4 5.2 20.63 29.2" />
      <path d="M14.22 8h3.55M13.82 11h4.36M13.42 14h5.17M13.01 17h5.97M12.61 20h6.78M12.21 23h7.59M11.8 26h8.4" strokeWidth="0.9" />
      <path d="M16 5.2v2.8M15.01 8v3M16.99 8v3M16 11v3M14.61 14v3M17.39 14v3M16 17v3M14.2 20v3M17.8 20v3M16 23v3M13.79 26v3.2M18.21 26v3.2" strokeWidth="0.8" />
      <path d="M1.6 29.2c1.5-2.4 5-3.3 9.9-3.5M20.5 25.7c4.9.2 8.4 1.1 9.9 3.5M4.2 29.2a1.7 1.7 0 0 1 3.4 0M24.4 29.2a1.7 1.7 0 0 1 3.4 0" />
      <path d="M.8 29.6h30.4" />
    </svg>
  );
}
