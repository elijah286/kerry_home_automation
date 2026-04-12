'use client';

import { useState, useEffect, useRef } from 'react';
import { LCARS_COLORS } from '@/components/lcars/colors';
import { useTheme } from '@/providers/ThemeProvider';

interface Star {
  x: number;
  y: number;
  size: number;
  brightness: number;
  color: string;
  speed: number;
  name?: string;
}

export default function StarChartPage() {
  const { activeTheme } = useTheme();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [stars, setStars] = useState<Star[]>([]);
  const animRef = useRef<number>(0);
  const [mode, setMode] = useState<'chart' | 'warp'>('chart');

  // Generate stars on mount
  useEffect(() => {
    const starColors = ['#ffffff', '#aaccff', '#ffddaa', '#ffaaaa', '#aaffcc', '#ccaaff'];
    const namedStars = ['Sol', 'Vulcan', 'Andoria', 'Qo\'noS', 'Romulus', 'Betazed', 'Bajor', 'Cardassia', 'Ferenginar', 'Risa'];
    const generated: Star[] = [];
    for (let i = 0; i < 200; i++) {
      generated.push({
        x: Math.random() * 100,
        y: Math.random() * 100,
        size: Math.random() * 2.5 + 0.5,
        brightness: Math.random() * 0.6 + 0.4,
        color: starColors[Math.floor(Math.random() * starColors.length)],
        speed: Math.random() * 0.02 + 0.005,
        name: i < namedStars.length ? namedStars[i] : undefined,
      });
    }
    setStars(generated);
  }, []);

  // Canvas animation
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || stars.length === 0) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const resize = () => {
      canvas.width = canvas.offsetWidth * 2;
      canvas.height = canvas.offsetHeight * 2;
      ctx.scale(2, 2);
    };
    resize();
    window.addEventListener('resize', resize);

    let offset = 0;
    const draw = () => {
      const w = canvas.offsetWidth;
      const h = canvas.offsetHeight;
      ctx.clearRect(0, 0, w, h);

      // Grid lines
      ctx.strokeStyle = '#1a1a2e';
      ctx.lineWidth = 0.5;
      for (let i = 0; i <= 10; i++) {
        ctx.beginPath();
        ctx.moveTo((w / 10) * i, 0);
        ctx.lineTo((w / 10) * i, h);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(0, (h / 10) * i);
        ctx.lineTo(w, (h / 10) * i);
        ctx.stroke();
      }

      // Stars
      for (const star of stars) {
        const sx = mode === 'warp'
          ? ((star.x + offset * star.speed * 50) % 100) / 100 * w
          : (star.x / 100) * w;
        const sy = (star.y / 100) * h;

        if (mode === 'warp') {
          // Warp streaks
          ctx.strokeStyle = star.color;
          ctx.lineWidth = star.size * 0.8;
          ctx.globalAlpha = star.brightness;
          ctx.beginPath();
          ctx.moveTo(sx, sy);
          ctx.lineTo(sx - star.speed * 800, sy);
          ctx.stroke();
          ctx.globalAlpha = 1;
        } else {
          // Normal stars with twinkle
          const twinkle = Math.sin(offset * star.speed * 10) * 0.3 + 0.7;
          ctx.globalAlpha = star.brightness * twinkle;
          ctx.fillStyle = star.color;
          ctx.beginPath();
          ctx.arc(sx, sy, star.size, 0, Math.PI * 2);
          ctx.fill();
          ctx.globalAlpha = 1;

          // Named star labels
          if (star.name) {
            ctx.fillStyle = LCARS_COLORS.lilac;
            ctx.font = "10px 'Antonio', sans-serif";
            ctx.globalAlpha = 0.7;
            ctx.fillText(star.name.toUpperCase(), sx + star.size + 4, sy + 3);
            ctx.globalAlpha = 1;

            // Targeting reticle
            ctx.strokeStyle = LCARS_COLORS.gold + '44';
            ctx.lineWidth = 0.5;
            ctx.beginPath();
            ctx.arc(sx, sy, star.size + 6, 0, Math.PI * 2);
            ctx.stroke();
          }
        }
      }

      // Scanning line
      const scanX = (offset * 30) % w;
      ctx.strokeStyle = LCARS_COLORS.gold + '22';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(scanX, 0);
      ctx.lineTo(scanX, h);
      ctx.stroke();

      offset += 0.1;
      animRef.current = requestAnimationFrame(draw);
    };

    draw();
    return () => {
      cancelAnimationFrame(animRef.current);
      window.removeEventListener('resize', resize);
    };
  }, [stars, mode]);

  if (activeTheme !== 'lcars') {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: 'var(--color-text-muted)' }}>
        Stellar Cartography is only available with the LCARS theme.
      </div>
    );
  }

  return (
    <div
      style={{
        fontFamily: "'Antonio', 'Helvetica Neue', sans-serif",
        textTransform: 'uppercase',
        letterSpacing: '0.08em',
        color: LCARS_COLORS.gold,
      }}
    >
      {/* Controls */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <button
          onClick={() => setMode('chart')}
          style={{
            padding: '8px 20px',
            background: mode === 'chart' ? LCARS_COLORS.gold : LCARS_COLORS.gray,
            border: 'none',
            borderRadius: 999,
            color: '#000',
            fontFamily: "'Antonio', sans-serif",
            fontWeight: 700,
            fontSize: 13,
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            cursor: 'pointer',
          }}
        >
          Star Chart
        </button>
        <button
          onClick={() => setMode('warp')}
          style={{
            padding: '8px 20px',
            background: mode === 'warp' ? LCARS_COLORS.gold : LCARS_COLORS.gray,
            border: 'none',
            borderRadius: 999,
            color: '#000',
            fontFamily: "'Antonio', sans-serif",
            fontWeight: 700,
            fontSize: 13,
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            cursor: 'pointer',
          }}
        >
          Warp View
        </button>
      </div>

      {/* Star chart canvas */}
      <div
        style={{
          position: 'relative',
          background: '#000',
          border: `2px solid ${LCARS_COLORS.butterscotch}`,
          borderRadius: 16,
          overflow: 'hidden',
          height: 'calc(100vh - 260px)',
          minHeight: 400,
        }}
      >
        <canvas
          ref={canvasRef}
          style={{ width: '100%', height: '100%', display: 'block' }}
        />

        {/* Corner overlays */}
        <div style={{ position: 'absolute', top: 8, left: 12, fontSize: 10, color: LCARS_COLORS.lilac }}>
          Sector 001 — Federation Space
        </div>
        <div style={{ position: 'absolute', top: 8, right: 12, fontSize: 10, color: LCARS_COLORS.butterscotch }}>
          {mode === 'warp' ? 'Warp Factor 6' : 'Cartographic Mode'}
        </div>
        <div style={{ position: 'absolute', bottom: 8, left: 12, fontSize: 10, color: LCARS_COLORS.gray }}>
          Long Range Sensors Active
        </div>
        <div style={{ position: 'absolute', bottom: 8, right: 12, fontSize: 10, color: LCARS_COLORS.gray }}>
          Stellar Cartography Lab
        </div>
      </div>
    </div>
  );
}
