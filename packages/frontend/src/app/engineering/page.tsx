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

  return <Engineering3DPanel />;
}
