'use client';

/**
 * United Federation of Planets emblem — detailed SVG rendition.
 * Blue gradient disc with starfield, concentric rings, and laurel wreath.
 */
export function FederationEmblem({ size = 120, className }: { size?: number; className?: string }) {
  const w = 200;
  const h = 220;
  const scale = size / w;

  return (
    <svg
      className={className}
      width={size}
      height={size * (h / w)}
      viewBox={`0 0 ${w} ${h}`}
      aria-hidden
    >
      <defs>
        {/* Disc gradient — deep navy to royal blue */}
        <radialGradient id="ufp-disc" cx="50%" cy="40%" r="55%">
          <stop offset="0%" stopColor="#5080d0" />
          <stop offset="40%" stopColor="#2050a8" />
          <stop offset="80%" stopColor="#102868" />
          <stop offset="100%" stopColor="#081840" />
        </radialGradient>
        {/* Sheen overlay */}
        <radialGradient id="ufp-sheen" cx="45%" cy="30%" r="50%">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.18" />
          <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
        </radialGradient>
        {/* Wreath gradient */}
        <linearGradient id="ufp-wreath" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#2060b8" />
          <stop offset="50%" stopColor="#103080" />
          <stop offset="100%" stopColor="#081848" />
        </linearGradient>
        {/* Star glow */}
        <filter id="ufp-glow">
          <feGaussianBlur stdDeviation="1.5" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      <g transform={`translate(${w / 2}, 95)`}>
        {/* === LEFT WREATH === */}
        <g>
          {/* Main branch curve - left side chevrons/leaves going down */}
          {[...Array(7)].map((_, i) => {
            const angle = -50 + i * 18;
            const rad = (angle * Math.PI) / 180;
            const r = 80 + i * 1.5;
            const cx = -Math.sin(-rad) * r;
            const cy = Math.cos(-rad) * r - 10;
            const leafAngle = angle + 40;
            return (
              <g key={`lw-${i}`} transform={`translate(${cx}, ${cy}) rotate(${leafAngle})`}>
                <path
                  d="M 0,-12 L 7,0 L 0,3 L -7,0 Z"
                  fill="url(#ufp-wreath)"
                  stroke="#1848a0"
                  strokeWidth="0.5"
                  opacity={0.95 - i * 0.03}
                />
              </g>
            );
          })}
        </g>

        {/* === RIGHT WREATH === */}
        <g>
          {[...Array(7)].map((_, i) => {
            const angle = 50 - i * 18;
            const rad = (angle * Math.PI) / 180;
            const r = 80 + i * 1.5;
            const cx = Math.sin(rad) * r;
            const cy = Math.cos(-rad) * r - 10;
            const leafAngle = -angle - 40;
            return (
              <g key={`rw-${i}`} transform={`translate(${cx}, ${cy}) rotate(${leafAngle})`}>
                <path
                  d="M 0,-12 L 7,0 L 0,3 L -7,0 Z"
                  fill="url(#ufp-wreath)"
                  stroke="#1848a0"
                  strokeWidth="0.5"
                  opacity={0.95 - i * 0.03}
                />
              </g>
            );
          })}
        </g>

        {/* Bottom ribbon tails */}
        <path
          d="M -14,72 Q -20,80 -28,90 Q -22,84 -16,76 Q -10,78 -8,74 Z"
          fill="url(#ufp-wreath)"
          stroke="#1040a0"
          strokeWidth="0.5"
        />
        <path
          d="M 14,72 Q 20,80 28,90 Q 22,84 16,76 Q 10,78 8,74 Z"
          fill="url(#ufp-wreath)"
          stroke="#1040a0"
          strokeWidth="0.5"
        />

        {/* === DISC === */}
        {/* Outer ring */}
        <circle cx="0" cy="0" r="62" fill="none" stroke="#3060b0" strokeWidth="3" />
        {/* Inner ring */}
        <circle cx="0" cy="0" r="58" fill="none" stroke="#2050a0" strokeWidth="1.5" />
        {/* Main disc */}
        <circle cx="0" cy="0" r="56" fill="url(#ufp-disc)" />
        {/* Sheen */}
        <circle cx="0" cy="0" r="56" fill="url(#ufp-sheen)" />

        {/* === STARFIELD === */}
        <g filter="url(#ufp-glow)">
          {/* Large four-pointed stars */}
          <FourPointStar cx={-12} cy={-10} r={10} fill="#e8f0ff" />
          <FourPointStar cx={16} cy={8} r={9} fill="#e0e8ff" />
          <FourPointStar cx={-18} cy={18} r={7} fill="#d8e4ff" />
          <FourPointStar cx={24} cy={-18} r={6} fill="#d0dcff" />
        </g>

        {/* Medium dots */}
        {[
          [-2, -30, 2.5], [28, -8, 2.2], [-30, -2, 2],
          [8, 28, 2], [-24, 24, 1.8], [32, 20, 1.8],
          [-6, 36, 1.6], [18, -32, 1.8], [-34, -18, 1.5],
          [38, -4, 1.4],
        ].map(([x, y, r], i) => (
          <circle key={`md-${i}`} cx={x} cy={y} r={r} fill="#c8d8f0" opacity={0.9} />
        ))}

        {/* Small dots — dense starfield */}
        {[
          [-8, -22, 1.2, 0.8], [6, -18, 1, 0.75], [-18, -28, 1.1, 0.85], [10, -28, 0.9, 0.7],
          [22, -24, 1, 0.78], [-28, -14, 1, 0.82], [34, -14, 0.8, 0.72], [-36, 6, 1, 0.76],
          [14, 18, 1.1, 0.88], [-14, 30, 0.9, 0.74], [26, 30, 0.8, 0.7], [-28, 34, 0.7, 0.8],
          [4, 40, 0.9, 0.73], [-38, 16, 0.8, 0.78], [36, 12, 0.9, 0.82], [-20, -36, 0.7, 0.75],
          [30, -28, 0.7, 0.72], [-4, 44, 0.8, 0.85], [20, 38, 0.7, 0.7], [-32, 28, 0.8, 0.76],
          [40, 24, 0.7, 0.73], [-10, -40, 0.8, 0.8], [12, -40, 0.7, 0.77], [-40, -8, 0.6, 0.72],
          [42, -10, 0.6, 0.75], [-22, 40, 0.7, 0.78], [28, 36, 0.6, 0.7], [-6, -46, 0.6, 0.82],
          [0, 48, 0.6, 0.74], [-44, 0, 0.5, 0.7], [44, 2, 0.5, 0.72],
          [8, 8, 0.7, 0.85], [-8, 12, 0.6, 0.76], [20, -6, 0.6, 0.8], [-16, 6, 0.7, 0.73],
        ].map(([x, y, r, o], i) => (
          <circle key={`sd-${i}`} cx={x} cy={y} r={r} fill="#b0c4e0" opacity={o} />
        ))}
      </g>
    </svg>
  );
}

/** Four-pointed star shape */
function FourPointStar({ cx, cy, r, fill }: { cx: number; cy: number; r: number; fill: string }) {
  const inner = r * 0.3;
  const d = [
    `M ${cx} ${cy - r}`,
    `L ${cx + inner} ${cy - inner}`,
    `L ${cx + r} ${cy}`,
    `L ${cx + inner} ${cy + inner}`,
    `L ${cx} ${cy + r}`,
    `L ${cx - inner} ${cy + inner}`,
    `L ${cx - r} ${cy}`,
    `L ${cx - inner} ${cy - inner}`,
    'Z',
  ].join(' ');
  return <path d={d} fill={fill} opacity={0.95} />;
}
