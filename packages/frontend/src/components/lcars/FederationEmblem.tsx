'use client';

/**
 * Simplified United Federation of Planets emblem (wheat wreath + disc + starfield) for LCARS boot.
 * Stylized geometry — not an exact trademark reproduction.
 */
export function FederationEmblem({ size = 120, className }: { size?: number; className?: string }) {
  return (
    <svg
      className={className}
      width={size}
      height={size * 1.15}
      viewBox="0 0 100 115"
      aria-hidden
    >
      <ellipse cx="50" cy="48" rx="34" ry="38" fill="#ff9900" />
      <ellipse cx="50" cy="50" rx="26" ry="30" fill="#0a0a0f" />
      <circle cx="38" cy="44" r="2.2" fill="#ffcc66" />
      <circle cx="52" cy="40" r="1.8" fill="#ffcc66" />
      <circle cx="60" cy="52" r="2" fill="#ffcc66" />
      <circle cx="44" cy="58" r="1.6" fill="#ffcc66" />
      <circle cx="54" cy="62" r="1.5" fill="#ffcc66" />
      <path
        d="M 50 18 Q 28 22 18 42 Q 14 58 22 72 Q 30 86 50 92 Q 70 86 78 72 Q 86 58 82 42 Q 72 22 50 18 Z"
        fill="none"
        stroke="#ff9900"
        strokeWidth="2.5"
        opacity={0.85}
      />
      <path
        d="M 50 22 Q 32 26 24 44 Q 20 56 26 68 Q 32 80 50 86 Q 68 80 74 68 Q 80 56 76 44 Q 68 26 50 22 Z"
        fill="none"
        stroke="#cc99cc"
        strokeWidth="1.2"
        opacity={0.6}
      />
    </svg>
  );
}
