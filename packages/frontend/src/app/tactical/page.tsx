'use client';

import { useState, useEffect, createElement } from 'react';
import { LCARS_COLORS } from '@/components/lcars/colors';
import { useTheme } from '@/providers/ThemeProvider';
import { useWebSocket } from '@/hooks/useWebSocket';
import { Shield, Lock, Unlock, Eye, EyeOff, AlertTriangle, Activity } from 'lucide-react';

function getDeviceStatus(d: any): string {
  if (!d.available) return 'Offline';
  if ('locked' in d) return d.locked ? 'Secured' : 'Unsecured';
  if ('on' in d) return d.on ? 'Active' : 'Inactive';
  if ('motionDetected' in d) return d.motionDetected ? 'Motion' : 'Clear';
  if ('recording' in d) return d.recording ? 'Recording' : 'Monitoring';
  return d.available ? 'Online' : 'Offline';
}

export default function TacticalPage() {
  const { activeTheme } = useTheme();
  const { devices } = useWebSocket();

  if (activeTheme !== 'lcars') {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: 'var(--color-text-muted)' }}>
        The Tactical view is only available with the LCARS theme.
      </div>
    );
  }

  // Group devices by security-relevant categories
  const deviceList = devices ?? [];
  const locks = deviceList.filter((d: any) => d.type === 'lock');
  const motionSensors = deviceList.filter((d: any) => d.type === 'sensor');
  const cameras = deviceList.filter((d: any) => d.type === 'camera');
  const alarmDevices = deviceList.filter((d: any) => d.type === 'doorbell');

  return (
    <div
      style={{
        fontFamily: "'Antonio', 'Helvetica Neue', sans-serif",
        textTransform: 'uppercase',
        letterSpacing: '0.08em',
        color: LCARS_COLORS.gold,
      }}
    >
      {/* Security Status Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          marginBottom: 24,
          padding: '12px 20px',
          background: LCARS_COLORS.tomato,
          borderRadius: 999,
          color: '#000',
        }}
      >
        <Shield size={20} />
        <span style={{ fontWeight: 700, fontSize: 16 }}>Tactical Systems Overview</span>
        <span style={{ marginLeft: 'auto', fontSize: 13 }}>Shields: Nominal</span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 16 }}>
        {/* Security Grid */}
        <TacticalPanel title="Access Control" icon={Lock} color={LCARS_COLORS.tomato} count={locks.length}>
          {locks.length === 0 ? (
            <EmptyState>No lock devices detected</EmptyState>
          ) : (
            locks.map((d: any) => {
              const status = getDeviceStatus(d);
              return (
                <StatusRow
                  key={d.id}
                  label={d.aliases?.[0] || d.displayName || d.name || d.id}
                  value={status}
                  color={status === 'Secured' ? LCARS_COLORS.green : LCARS_COLORS.tomato}
                  icon={status === 'Secured' ? Lock : Unlock}
                />
              );
            })
          )}
        </TacticalPanel>

        {/* Motion Sensors */}
        <TacticalPanel title="Motion Sensors" icon={Activity} color={LCARS_COLORS.butterscotch} count={motionSensors.length}>
          {motionSensors.length === 0 ? (
            <EmptyState>No motion sensors detected</EmptyState>
          ) : (
            motionSensors.slice(0, 8).map((d: any) => {
              const status = getDeviceStatus(d);
              return (
                <StatusRow
                  key={d.id}
                  label={d.aliases?.[0] || d.displayName || d.name || d.id}
                  value={status}
                  color={status === 'Motion' || status === 'Active' ? LCARS_COLORS.butterscotch : LCARS_COLORS.green}
                  icon={status === 'Motion' || status === 'Active' ? Eye : EyeOff}
                />
              );
            })
          )}
        </TacticalPanel>

        {/* Camera Grid */}
        <TacticalPanel title="Visual Sensors" icon={Eye} color={LCARS_COLORS.ice} count={cameras.length}>
          {cameras.length === 0 ? (
            <EmptyState>No cameras detected</EmptyState>
          ) : (
            cameras.map((d: any) => (
              <StatusRow
                key={d.id}
                label={d.aliases?.[0] || d.displayName || d.name || d.id}
                value={getDeviceStatus(d)}
                color={LCARS_COLORS.ice}
                icon={Eye}
              />
            ))
          )}
        </TacticalPanel>

        {/* Alert Conditions */}
        <TacticalPanel title="Alert Conditions" icon={AlertTriangle} color={LCARS_COLORS.peach} count={alarmDevices.length}>
          {alarmDevices.length === 0 ? (
            <EmptyState>No alert conditions active</EmptyState>
          ) : (
            alarmDevices.map((d: any) => (
              <StatusRow
                key={d.id}
                label={d.aliases?.[0] || d.displayName || d.name || d.id}
                value={getDeviceStatus(d)}
                color={LCARS_COLORS.peach}
                icon={AlertTriangle}
              />
            ))
          )}
        </TacticalPanel>
      </div>
    </div>
  );
}

function TacticalPanel({
  title,
  icon: Icon,
  color,
  count,
  children,
}: {
  title: string;
  icon: React.ElementType;
  color: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <div style={{ background: '#0a0a1a', borderRadius: 12, overflow: 'hidden' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '8px 16px',
          background: color,
          color: '#000',
          fontWeight: 700,
          fontSize: 13,
        }}
      >
        {createElement(Icon, { size: 16 })}
        <span>{title}</span>
        <span
          style={{
            marginLeft: 'auto',
            background: '#00000033',
            padding: '2px 10px',
            borderRadius: 999,
            fontSize: 12,
          }}
        >
          {count}
        </span>
      </div>
      <div style={{ padding: '8px 12px', display: 'flex', flexDirection: 'column', gap: 4 }}>{children}</div>
    </div>
  );
}

function StatusRow({
  label,
  value,
  color,
  icon: Icon,
}: {
  label: string;
  value: string;
  color: string;
  icon: React.ElementType;
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '6px 8px',
        borderLeft: `3px solid ${color}`,
        fontSize: 12,
      }}
    >
      {createElement(Icon, { size: 12, style: { color, flexShrink: 0 } })}
      <span style={{ flex: 1, color: LCARS_COLORS.sunflower }}>{label}</span>
      <span style={{ color, fontWeight: 600 }}>{value}</span>
    </div>
  );
}

function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ padding: 16, textAlign: 'center', color: LCARS_COLORS.gray, fontSize: 12 }}>{children}</div>
  );
}
