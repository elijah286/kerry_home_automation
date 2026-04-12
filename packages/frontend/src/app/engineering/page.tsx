'use client';

import { Engineering3DPanel } from '@/components/lcars/Engineering3DPanel';
import { useTheme } from '@/providers/ThemeProvider';

export default function EngineeringPage() {
  const { activeTheme } = useTheme();

  if (activeTheme !== 'lcars') {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: 'var(--color-text-muted)' }}>
        The Engineering view is only available with the LCARS theme.
      </div>
    );
  }

  /**
   * LCARS main: marginTop ~82px, marginBottom ~30px, vertical padding ~28px → ~140px below 100dvh.
   * Fixed height chain so the iframe / R3F canvas can fill the viewport (flex + % height alone is unreliable inside `main` with only min-height).
   */
  return (
    <div
      style={{
        height: 'calc(100dvh - 140px)',
        minHeight: 320,
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <Engineering3DPanel />
    </div>
  );
}
