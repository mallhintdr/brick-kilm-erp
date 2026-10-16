// Bhatta (kiln) chimney: tall, tapering towards the top, thin outline with brick courses, a cap,
// a low plinth on the ground and smoke drifting up. Same drawing as public/icon.svg.
// The burst prop: change it (e.g. to Date.now()) to make the chimney pour out a thick cloud for a moment.
export default function KilnLogo({ size = 24, color = '#ffffff', smoke = true, title, burst }) {
  return (
    <svg viewBox="0 0 32 32" width={size} height={size} fill="none" stroke={color} strokeWidth="1.1"
      strokeLinecap="round" strokeLinejoin="round" role={title ? 'img' : undefined} aria-hidden={title ? undefined : 'true'}
      className="kiln-logo" style={{ overflow: 'visible' }}>
      {title && <title>{title}</title>}
      {smoke && (
        <g className="kiln-logo-smoke" transform="translate(-10 -0.4) scale(1.5)" strokeWidth="0.7">
          <path className="puff p1" d="M16.4 3.9c-1.3-.1-1.7-1.5-.8-2.2.2-1.2 1.8-1.5 2.4-.6 1.1-.3 1.9.8 1.3 1.7.1 1-1.1 1.4-1.8.8" />
          <path className="puff p2" d="M19.6 2c-.7-.5-.4-1.6.5-1.6.4-.7 1.5-.6 1.7.2.8.1.9 1.1.2 1.4-.3.5-1.1.5-1.4.1" />
          <path className="puff p3" d="M22.6.9c-.4-.3-.2-.9.3-.9" />
        </g>
      )}
      {burst && (
        // thick cloud: billows out for 1s, then rises and fades over 2s (keyed so every tap replays it)
        <g key={burst} className="kiln-logo-burst" strokeWidth="0.9" transform="translate(0 2)">
          <path className="b b1" d="M14.2 3.6c-2.4-.2-3.2-2.8-1.4-4.1.4-2.3 3.4-2.9 4.5-1.1 2.1-.6 3.6 1.4 2.5 3.2.3 1.9-2.1 2.7-3.4 1.5-.7.6-1.6.7-2.2.5z" />
          <path className="b b2" d="M18.4 1.2c-1.8-.3-2.1-2.4-.7-3.2.5-1.6 2.7-1.8 3.4-.5 1.6-.2 2.5 1.4 1.6 2.6 0 1.4-1.8 1.9-2.7 1z" />
          <path className="b b3" d="M11.6 1.4c-1.6-.2-2-2.1-.7-2.9.4-1.4 2.4-1.6 3-.4 1.4-.2 2.2 1.2 1.4 2.3 0 1.2-1.6 1.7-2.4.9z" />
          <path className="b b4" d="M21.8-1.4c-1.2-.4-1.2-2 0-2.4.6-1 2.1-.8 2.4.3 1.1.3 1.2 1.7.2 2.1-.6.6-1.6.6-2.1.1z" />
          <path className="b b5" d="M15.6-2.6c-1.3-.3-1.4-2-.2-2.5.5-1.1 2.2-1.1 2.6 0 1.1.1 1.4 1.6.4 2.1-.5.7-1.6.8-2.2.3z" />
        </g>
      )}
      <path d="M13.9 6.3h4.2v1.3h-4.2zM14.5 7.6h3" />
      <path d="M14.5 7.6 11.4 30.4M17.5 7.6 20.6 30.4" />
      <path d="M14.12 10.4h3.76M13.74 13.2h4.52M13.36 16h5.28M12.98 18.8h6.05M12.6 21.6h6.81M12.22 24.4h7.57M11.84 27.2h8.33" strokeWidth="0.9" />
      <path d="M16 7.6v2.8M14.96 10.4v2.8M17.04 10.4v2.8M16 13.2v2.8M14.58 16v2.8M17.42 16v2.8M16 18.8v2.8M14.2 21.6v2.8M17.8 21.6v2.8M16 24.4v2.8M13.81 27.2v3.2M18.19 27.2v3.2" strokeWidth="0.8" />
      <path d="M10 31V30.4h12V31" />
      <path d="M7.5 31h17" />
    </svg>
  );
}
