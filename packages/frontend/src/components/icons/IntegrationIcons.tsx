import type { SVGProps } from 'react';

type IconProps = SVGProps<SVGSVGElement>;

// ---------------------------------------------------------------------------
// Lutron — stylised "L" arch
// ---------------------------------------------------------------------------
export function LutronIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M6 20V7a6 6 0 0 1 12 0" />
      <circle cx="18" cy="7" r="1.5" fill="currentColor" stroke="none" />
      <path d="M6 20h6" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Yamaha — tuning-fork logo
// ---------------------------------------------------------------------------
export function YamahaIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" stroke="none" {...props}>
      <path d="M12 2C12 2 9 6.5 9 9.5c0 1.4.8 2.6 2 3.2V22h2V12.7c1.2-.6 2-1.8 2-3.2C15 6.5 12 2 12 2z" />
      <path d="M7.5 4.5C6 6.5 5 8.8 5 10.5c0 2.5 1.5 4.6 3.5 5.5l.7-1.8C7.9 13.5 7 12.1 7 10.5c0-1.3.6-3 1.5-4.5l-1-1.5z" opacity=".6" />
      <path d="M16.5 4.5c1.5 2 2.5 4.3 2.5 6 0 2.5-1.5 4.6-3.5 5.5l-.7-1.8c1.3-.7 2.2-2.1 2.2-3.7 0-1.3-.6-3-1.5-4.5l1-1.5z" opacity=".6" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Paprika — chili pepper
// ---------------------------------------------------------------------------
export function PaprikaIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M12 2c0 2-2 3-2 3" />
      <path d="M10 5c-3 0-6 3-6 8s3 9 6 9c1.5 0 2-1 2-1s.5 1 2 1c3 0 6-4 6-9s-3-8-6-8h-4z" fill="currentColor" fillOpacity=".15" />
      <path d="M12 5v4" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Pentair — water/pool waves
// ---------------------------------------------------------------------------
export function PentairIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" {...props}>
      <path d="M2 8c2-2 4-2 6 0s4 2 6 0 4-2 6 0" />
      <path d="M2 13c2-2 4-2 6 0s4 2 6 0 4-2 6 0" />
      <path d="M2 18c2-2 4-2 6 0s4 2 6 0 4-2 6 0" opacity=".5" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Tesla — stylised "T"
// ---------------------------------------------------------------------------
export function TeslaIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" stroke="none" {...props}>
      <path d="M12 22L7.5 7.5c0 0 1.5-1 4.5-1s4.5 1 4.5 1L12 22z" />
      <path d="M4 5.5C5.5 4.5 8.5 3.5 12 3.5s6.5 1 8 2l-1.2 1.5c-1.2-.7-3.5-1.5-6.8-1.5S6.4 6.3 5.2 7L4 5.5z" />
      <circle cx="12" cy="2.5" r="1.2" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// UniFi Protect — shield with eye
// ---------------------------------------------------------------------------
export function UnifiIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M12 3L4 7v5c0 5 3.5 8.5 8 10 4.5-1.5 8-5 8-10V7l-8-4z" fill="currentColor" fillOpacity=".1" />
      <circle cx="12" cy="12" r="2.5" />
      <path d="M7 12c1.5-2 3-3 5-3s3.5 1 5 3" />
      <path d="M7 12c1.5 2 3 3 5 3s3.5-1 5-3" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Sony Bravia — TV screen
// ---------------------------------------------------------------------------
export function SonyIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <rect x="2" y="4" width="20" height="13" rx="1.5" fill="currentColor" fillOpacity=".1" />
      <path d="M8 21h8" />
      <path d="M12 17v4" />
      <text x="12" y="12.5" textAnchor="middle" fontSize="5" fontWeight="bold" fill="currentColor" stroke="none" fontFamily="system-ui">S</text>
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Weather (NWS) — sun behind cloud
// ---------------------------------------------------------------------------
export function WeatherIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <circle cx="10" cy="8" r="3" fill="currentColor" fillOpacity=".2" />
      <path d="M10 3v1M10 12v1M15 8h-1M5 8h1M13.5 4.5l-.7.7M6.5 11.5l.7-.7M13.5 11.5l-.7-.7M6.5 4.5l.7.7" />
      <path d="M8 15a4 4 0 0 1 .5-7.9 4 4 0 0 1 7.4 1.4A3 3 0 0 1 19 11.5 3 3 0 0 1 16 14.5H8z" fill="currentColor" fillOpacity=".15" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Xbox — circle with X
// ---------------------------------------------------------------------------
export function XboxIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <circle cx="12" cy="12" r="9" fill="currentColor" fillOpacity=".1" />
      <path d="M7 17c1.5-3 3-5.5 5-8.5" strokeWidth="2" />
      <path d="M17 17c-1.5-3-3-5.5-5-8.5" strokeWidth="2" />
      <path d="M5.5 7.5C7 6 9.5 5 12 5s5 1 6.5 2.5" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Meross — smart plug
// ---------------------------------------------------------------------------
export function MerossIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <rect x="5" y="3" width="14" height="14" rx="3" fill="currentColor" fillOpacity=".1" />
      <circle cx="9" cy="10" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="15" cy="10" r="1.5" fill="currentColor" stroke="none" />
      <path d="M9 17v4M15 17v4" strokeWidth="2" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Roborock — robot vacuum (top-down)
// ---------------------------------------------------------------------------
export function RoborockIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <circle cx="12" cy="12" r="9" fill="currentColor" fillOpacity=".1" />
      <circle cx="12" cy="10" r="3" />
      <path d="M9 10h6" />
      <circle cx="12" cy="16" r="1" fill="currentColor" stroke="none" />
      <path d="M6 6l2 2M18 6l-2 2" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Rachio — sprinkler / water drop with leaf
// ---------------------------------------------------------------------------
export function RachioIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M12 3C9 7 6 10 6 14a6 6 0 0 0 12 0c0-4-3-7-6-11z" fill="currentColor" fillOpacity=".12" />
      <path d="M12 22v-8" />
      <path d="M12 14c-2.5-1.5-4-4-4-6" opacity=".6" />
      <path d="M12 14c2.5-1.5 4-4 4-6" opacity=".6" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// GameChanger — calendar + ball
// ---------------------------------------------------------------------------
export function GamechangerIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <rect x="3" y="4" width="18" height="18" rx="2" fill="currentColor" fillOpacity=".08" />
      <path d="M8 2v4M16 2v4M3 10h18" />
      <circle cx="12" cy="15" r="4" />
      <path d="M12 11v8M8.5 13.5h7" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// SportsEngine — stylised “SE” shield
// ---------------------------------------------------------------------------
export function SportsengineIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M12 3l7 4v6c0 4-3 7-7 8-4-1-7-4-7-8V7l7-4z" fill="currentColor" fillOpacity=".08" />
      <path d="M9 9.5h4.5a2 2 0 0 1 0 4H9v3.5M9 12h3" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// RainSoft — water drop + softener tank
// ---------------------------------------------------------------------------
export function RainsoftIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M12 3s5 5.5 5 9a5 5 0 1 1-10 0c0-3.5 5-9 5-9z" fill="currentColor" fillOpacity=".12" />
      <rect x="6" y="14" width="12" height="7" rx="1" fill="currentColor" fillOpacity=".06" />
      <path d="M6 17h12" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Sense — energy pulse
// ---------------------------------------------------------------------------
export function SenseIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M4 12h3l2-6 4 12 2-6h5" />
      <circle cx="12" cy="12" r="9" strokeOpacity=".25" />
    </svg>
  );
}
