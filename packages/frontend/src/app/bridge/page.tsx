'use client';

import { useState, useEffect } from 'react';
import { LCARS_COLORS } from '@/components/lcars/colors';
import { useAlert } from '@/components/lcars/LCARSAlertOverlay';
import { useLCARSSounds } from '@/components/lcars/LCARSSounds';
import { useTheme } from '@/providers/ThemeProvider';
import { useWebSocket } from '@/hooks/useWebSocket';

interface SystemStatus {
  label: string;
  status: 'nominal' | 'caution' | 'critical' | 'offline';
  value?: string;
}

export default function BridgePage() {
  const { activeTheme } = useTheme();
  const { setAlertLevel } = useAlert();
  const { play } = useLCARSSounds();
  const { devices } = useWebSocket();
  const [stardate, setStardate] = useState('');
  const [time, setTime] = useState('');

  useEffect(() => {
    const update = () => {
      const now = new Date();
      const year = now.getFullYear();
      const start = new Date(year, 0, 1);
      const dayOfYear = Math.floor((now.getTime() - start.getTime()) / 86400000);
      const fraction = ((dayOfYear / 365) * 1000).toFixed(1);
      setStardate(`${year - 1323}.${fraction}`);
      setTime(now.toLocaleTimeString('en-US', { hour12: false }));
    };
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, []);

  // Derive system statuses from real devices
  const deviceList = devices ?? [];
  const totalDevices = deviceList.length;
  const onlineDevices = deviceList.filter((d) => d.available).length;

  const systems: SystemStatus[] = [
    { label: 'Life Support', status: 'nominal', value: 'Active' },
    { label: 'Device Grid', status: onlineDevices === totalDevices ? 'nominal' : 'caution', value: `${onlineDevices}/${totalDevices}` },
    { label: 'Sensors', status: 'nominal', value: 'Online' },
    { label: 'Communications', status: 'nominal', value: 'Subspace Link' },
    { label: 'Security Grid', status: 'nominal', value: 'Armed' },
    { label: 'Environmental', status: 'nominal', value: 'Optimal' },
    { label: 'Power Systems', status: 'nominal', value: 'Full Output' },
    { label: 'Replicators', status: 'nominal', value: 'Standby' },
  ];

  const statusColor = (s: string) => {
    switch (s) {
      case 'nominal': return LCARS_COLORS.green;
      case 'caution': return LCARS_COLORS.butterscotch;
      case 'critical': return LCARS_COLORS.tomato;
      case 'offline': return LCARS_COLORS.gray;
      default: return LCARS_COLORS.lilac;
    }
  };

  if (activeTheme !== 'lcars') {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: 'var(--color-text-muted)' }}>
        The Bridge view is only available with the LCARS theme.
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
        minHeight: '70vh',
      }}
    >
      {/* Viewscreen area */}
      <div
        style={{
          position: 'relative',
          background: '#000',
          border: `3px solid ${LCARS_COLORS.butterscotch}`,
          borderRadius: 24,
          overflow: 'hidden',
          marginBottom: 24,
          minHeight: 280,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {/* Animated starfield */}
        <div className="lcars-starfield" style={{ position: 'absolute', inset: 0 }} />

        {/* Viewscreen frame corners */}
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 6, background: `linear-gradient(90deg, ${LCARS_COLORS.butterscotch}, transparent 20%, transparent 80%, ${LCARS_COLORS.butterscotch})` }} />
        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 6, background: `linear-gradient(90deg, ${LCARS_COLORS.butterscotch}, transparent 20%, transparent 80%, ${LCARS_COLORS.butterscotch})` }} />

        {/* Center content */}
        <div style={{ position: 'relative', zIndex: 1, textAlign: 'center' }}>
          <div style={{ fontSize: 12, color: LCARS_COLORS.lilac, marginBottom: 4 }}>Stardate</div>
          <div style={{ fontSize: 36, fontWeight: 700, color: LCARS_COLORS.gold, marginBottom: 4 }}>{stardate}</div>
          <div style={{ fontSize: 24, color: LCARS_COLORS.butterscotch }}>{time}</div>
        </div>
      </div>

      {/* Alert controls */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 24, flexWrap: 'wrap' }}>
        <AlertButton
          label="Normal Operations"
          color={LCARS_COLORS.green}
          onClick={() => { setAlertLevel('none'); play('beep'); }}
        />
        <AlertButton
          label="Yellow Alert"
          color="#ffcc00"
          onClick={() => { setAlertLevel('yellow'); play('alert'); }}
        />
        <AlertButton
          label="Red Alert"
          color={LCARS_COLORS.tomato}
          onClick={() => { setAlertLevel('red'); play('alert'); }}
        />
      </div>

      {/* Systems status grid */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
          gap: 8,
        }}
      >
        {systems.map((sys) => (
          <div
            key={sys.label}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '10px 16px',
              background: '#0a0a1a',
              borderLeft: `4px solid ${statusColor(sys.status)}`,
              borderRadius: '0 8px 8px 0',
            }}
          >
            <div
              className={sys.status === 'nominal' ? 'lcars-blink-slow' : sys.status === 'critical' ? 'lcars-blink' : ''}
              style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: statusColor(sys.status),
                flexShrink: 0,
              }}
            />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 11, color: LCARS_COLORS.lilac }}>{sys.label}</div>
              <div style={{ fontSize: 14, fontWeight: 600, color: statusColor(sys.status) }}>
                {sys.value || sys.status}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function AlertButton({ label, color, onClick }: { label: string; color: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '10px 24px',
        background: color,
        border: 'none',
        borderRadius: 999,
        color: '#000',
        fontFamily: "'Antonio', 'Helvetica Neue', sans-serif",
        fontWeight: 700,
        fontSize: 13,
        letterSpacing: '0.1em',
        textTransform: 'uppercase',
        cursor: 'pointer',
        transition: 'filter 0.15s',
      }}
      onMouseEnter={(e) => (e.currentTarget.style.filter = 'brightness(1.3)')}
      onMouseLeave={(e) => (e.currentTarget.style.filter = 'brightness(1)')}
    >
      {label}
    </button>
  );
}
