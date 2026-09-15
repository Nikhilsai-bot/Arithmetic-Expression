export default function StackIllustration() {
  return (
    <svg viewBox="0 0 420 460" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Illustration of a stack data structure processing an arithmetic expression">
      <defs>
        <style>{`
          .il-tile { fill: #1a2532; stroke: #35485c; stroke-width: 1.5; }
          .il-tile-top { fill: #a66a2e; stroke: #a66a2e; }
          .il-label { font-family: 'IBM Plex Mono', monospace; font-size: 20px; fill: #edf2f4; }
          .il-label-top { fill: #10151c; font-weight: 600; }
          .il-muted { font-family: 'IBM Plex Mono', monospace; font-size: 12px; fill: #6d8091; letter-spacing: 0.06em; }
          .il-flow { stroke: #35485c; stroke-width: 1.5; fill: none; }
          .il-arrow { fill: #35485c; }
        `}</style>
      </defs>

      {/* incoming token stream */}
      <text x="20" y="36" className="il-muted">INPUT</text>
      {["3", "+", "4", "*", "(", "2"].map((t, i) => (
        <g key={i} transform={`translate(${20 + i * 56}, 48)`}>
          <rect width="42" height="42" rx="4" className="il-tile" opacity={0.55} />
          <text x="21" y="28" textAnchor="middle" className="il-label" opacity={0.75}>{t}</text>
        </g>
      ))}

      {/* arrow down into stack */}
      <path d="M210 108 L210 150" className="il-flow" />
      <path d="M200 142 L210 156 L220 142 Z" className="il-arrow" />

      {/* the stack itself, growing upward, top tile highlighted */}
      <text x="20" y="190" className="il-muted">OPERATOR STACK</text>

      <g transform="translate(140, 200)">
        {/* base */}
        <rect x="-10" y="220" width="160" height="6" rx="2" fill="#35485c" />

        {/* tiles from bottom to top */}
        <g transform="translate(0, 160)">
          <rect width="140" height="52" rx="5" className="il-tile" />
          <text x="70" y="34" textAnchor="middle" className="il-label">(</text>
        </g>
        <g transform="translate(0, 104)">
          <rect width="140" height="52" rx="5" className="il-tile" />
          <text x="70" y="34" textAnchor="middle" className="il-label">*</text>
        </g>
        <g transform="translate(0, 48)">
          <rect width="140" height="52" rx="5" className="il-tile" />
          <text x="70" y="34" textAnchor="middle" className="il-label">+</text>
        </g>
        <g transform="translate(0, -8)">
          <rect width="140" height="52" rx="5" className="il-tile il-tile-top" />
          <text x="70" y="34" textAnchor="middle" className="il-label il-label-top">2</text>
        </g>
      </g>

      {/* outgoing postfix output */}
      <path d="M300 226 L360 226" className="il-flow" />
      <path d="M352 216 L366 226 L352 236 Z" className="il-arrow" />
      <text x="300" y="270" className="il-muted">OUTPUT</text>
      <text x="300" y="300" className="il-label" style={{ fontSize: "16px" }}>3 4 2 +</text>

      {/* result line */}
      <line x1="20" y1="360" x2="400" y2="360" stroke="#35485c" strokeWidth="1" />
      <text x="20" y="400" className="il-muted">RESULT</text>
      <text x="20" y="438" fill="#edf2f4" fontFamily="'Source Serif 4', serif" fontSize="44" fontWeight="700">
        21
      </text>
    </svg>
  );
}
