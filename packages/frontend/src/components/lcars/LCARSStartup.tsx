'use client';

import { useState, useEffect } from 'react';
import { LCARS_COLORS } from './colors';
import { FederationEmblem } from './FederationEmblem';
import { LCARSElbow } from './LCARSElbow';

const BOOT_LINES = [
  'LCARS INTERFACE v47.3.1',
  'INITIALIZING SUBSPACE PROTOCOLS…',
  'SCANNING LOCAL SENSOR GRID…',
  'DEVICE MANIFEST LOADED',
  'FEDERATION NETWORK ONLINE',
  'ALL SYSTEMS OPERATIONAL',
];

/** Mini chrome frame so boot matches main LCARS shell. */
function BootChrome() {
  const barW = 100;
  const headerH = 28;
  const footerH = 22;
  const or = 40;
  const ir = 18;
  const elbowW = barW + ir;
  const gold = LCARS_COLORS.gold;
  const lilac = LCARS_COLORS.lilac;
  const mag = LCARS_COLORS.magenta;

  return (
    <div className="pointer-events-none fixed inset-0 z-[10000]" aria-hidden>
      <div className="absolute left-0 top-0 z-[10001]" style={{ lineHeight: 0 }}>
        <LCARSElbow
          position="top-left"
          barWidth={barW}
          barHeight={headerH}
          outerRadius={or}
          innerRadius={ir}
          color={gold}
        />
      </div>
      <div
        className="absolute right-0 top-0 z-[10001] flex items-stretch"
        style={{ left: elbowW, height: headerH, background: '#000' }}
      >
        <div className="flex-1" style={{ background: lilac }} />
        <div className="w-[14%] min-w-[48px]" style={{ background: mag }} />
        <div className="w-10 rounded-r-full" style={{ background: gold }} />
      </div>
      <div
        className="absolute z-[10001] border-l-[3px]"
        style={{
          left: barW,
          top: headerH + or,
          bottom: footerH + or,
          borderColor: lilac,
          opacity: 0.85,
        }}
      />
      <div className="absolute bottom-0 left-0 z-[10001]" style={{ lineHeight: 0 }}>
        <LCARSElbow
          position="bottom-left"
          barWidth={barW}
          barHeight={footerH}
          outerRadius={or}
          innerRadius={ir}
          color={mag}
        />
      </div>
      <div
        className="absolute bottom-0 right-0 z-[10001] flex items-stretch gap-0.5"
        style={{ left: elbowW, height: footerH, background: '#000' }}
      >
        <div className="flex-[2]" style={{ background: lilac, opacity: 0.9 }} />
        <div className="flex-1" style={{ background: gold, opacity: 0.85 }} />
        <div className="flex-[2] rounded-r-full" style={{ background: mag }} />
      </div>
    </div>
  );
}

export function LCARSStartup({ onDismiss }: { onDismiss?: () => void }) {
  const [visibleLines, setVisibleLines] = useState(0);
  const [barWidth, setBarWidth] = useState(0);

  useEffect(() => {
    const lineTimers: NodeJS.Timeout[] = [];
    BOOT_LINES.forEach((_, i) => {
      lineTimers.push(
        setTimeout(() => setVisibleLines(i + 1), 400 + i * 300),
      );
    });

    const barTimer = setInterval(() => {
      setBarWidth((prev) => {
        if (prev >= 100) {
          clearInterval(barTimer);
          return 100;
        }
        return prev + 1.5;
      });
    }, 50);

    return () => {
      lineTimers.forEach(clearTimeout);
      clearInterval(barTimer);
    };
  }, []);

  return (
    <div
      onClick={onDismiss}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') onDismiss?.();
      }}
      role="button"
      tabIndex={0}
      style={{
        position: 'fixed',
        inset: 0,
        background: '#000',
        zIndex: 9999,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: 'var(--font-antonio), "Helvetica Neue", sans-serif',
        textTransform: 'uppercase',
        letterSpacing: '0.1em',
        cursor: 'pointer',
      }}
    >
      <BootChrome />

      {/* Emblem + Title */}
      <div className="relative z-[10002] flex flex-col items-center px-6">
        <div style={{ opacity: 0, animation: 'lcars-fade-in 0.6s 0.1s forwards' }}>
          <FederationEmblem size={180} />
        </div>
        <div
          style={{
            marginTop: 12,
            color: '#a0c4f0',
            fontSize: 18,
            fontWeight: 700,
            letterSpacing: '0.22em',
            opacity: 0,
            animation: 'lcars-fade-in 0.5s 0.3s forwards',
          }}
        >
          United Federation of Planets
        </div>
      </div>

      {/* Progress bar */}
      <div
        style={{
          width: 360,
          maxWidth: '70vw',
          height: 6,
          background: '#0a1428',
          borderRadius: 999,
          marginTop: 32,
          overflow: 'hidden',
          border: '1px solid #1a3060',
        }}
        className="relative z-[10002]"
      >
        <div
          style={{
            width: `${barWidth}%`,
            height: '100%',
            background: 'linear-gradient(90deg, #2060b0, #60a0e0, #a0c8f0)',
            borderRadius: 999,
            transition: 'width 0.08s linear',
            boxShadow: '0 0 8px rgba(96, 160, 224, 0.5)',
          }}
        />
      </div>

      {/* Boot text */}
      <div style={{ width: 360, maxWidth: '70vw', marginTop: 24 }} className="relative z-[10002]">
        {BOOT_LINES.slice(0, visibleLines).map((line, i) => (
          <div
            key={i}
            style={{
              color: i === 0 ? LCARS_COLORS.gold : LCARS_COLORS.butterscotch,
              fontSize: i === 0 ? 16 : 11,
              fontWeight: i === 0 ? 700 : 500,
              marginBottom: i === 0 ? 10 : 4,
              opacity: 0,
              animation: 'lcars-fade-in 0.35s forwards',
            }}
          >
            {line}
            {i === visibleLines - 1 && i < BOOT_LINES.length - 1 && (
              <span className="lcars-cursor" style={{ color: LCARS_COLORS.gold }}>_</span>
            )}
          </div>
        ))}
      </div>

      <div
        style={{
          color: LCARS_COLORS.lilac,
          fontSize: 10,
          marginTop: 18,
        }}
        className="relative z-[10002]"
      >
        Stardate {getStardate()} · tap to dismiss
      </div>
    </div>
  );
}

function getStardate(): string {
  const now = new Date();
  const year = now.getFullYear();
  const start = new Date(year, 0, 1);
  const dayOfYear = Math.floor((now.getTime() - start.getTime()) / 86400000);
  const fraction = ((dayOfYear / 365) * 1000).toFixed(1);
  return `${year - 1323}.${fraction}`;
}
