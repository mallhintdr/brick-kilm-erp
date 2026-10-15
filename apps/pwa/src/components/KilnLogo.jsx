// Bhatta (kiln) chimney: thin outline with brick courses, a cap band, the kiln mound at its
// foot and smoke drifting up. Same drawing as the installed app icon (public/icon.svg).
export default function KilnLogo({ size = 24, color = '#ffffff', smoke = true, title }) {
  return (
    <svg viewBox="0 0 32 32" width={size} height={size} fill="none" stroke={color} strokeWidth="1.15"
      strokeLinecap="round" strokeLinejoin="round" role={title ? 'img' : undefined} aria-hidden={title ? undefined : 'true'}
      className="kiln-logo">
      {title && <title>{title}</title>}
      {/* smoke puffs */}
      {smoke && (
        <g className="kiln-logo-smoke" strokeWidth="1">
          <path className="puff p1" d="M15.2 6.2c-1.6-.2-2.2-1.9-1-2.8.2-1.5 2.2-1.9 3-.7 1.4-.4 2.4 1 1.6 2.2.2 1.2-1.4 1.8-2.2 1" />
          <path className="puff p2" d="M18.6 3.4c-.9-.6-.5-2 .6-2 .5-.9 1.9-.7 2.1.3 1 .1 1.2 1.4.3 1.8-.4.6-1.4.6-1.8.1" />
          <path className="puff p3" d="M22.4 1.9c-.5-.4-.2-1.2.4-1.2.3-.5 1.1-.4 1.2.2.6.1.6.8.1 1" />
        </g>
      )}
      {/* chimney cap and lip */}
      <path d="M12.6 7.6h6.8v1.3h-6.8z" />
      <path d="M13.1 8.9h5.8" />
      {/* tapered stack */}
      <path d="M13.2 8.9 11.6 26M18.8 8.9 20.4 26" />
      {/* brick courses (horizontal joints) */}
      <path d="M13.05 11.6h5.9M12.8 14.3h6.4M12.55 17h6.9M12.3 19.7h7.4M12.05 22.4h7.9" />
      {/* staggered vertical joints */}
      <path d="M16 8.9v2.7M14.5 11.6v2.7M17.5 11.6v2.7M16 14.3v2.7M14.3 17v2.7M17.7 17v2.7M16 19.7v2.7M14.1 22.4v3.6M17.9 22.4v3.6" />
      {/* kiln mound with firing arches */}
      <path d="M3 26c1.6-3 5-4.3 8.6-4.6M20.4 21.4c3.6.3 7 1.6 8.6 4.6" />
      <path d="M5.4 26a2 2 0 0 1 4 0M22.6 26a2 2 0 0 1 4 0" />
      {/* ground */}
      <path d="M1.5 26h29" />
      <path d="M4 28.2h6M13 28.2h6M22 28.2h6" strokeWidth=".9" opacity=".7" />
    </svg>
  );
}
