'use client';

// ---------------------------------------------------------------------------
// DashboardView — renders a DashboardDoc.
//
// Layout strategies:
//   - `sections`: CSS grid with auto-fit columns; each section is a column.
//   - `stack`:    single vertical column (mobile-first / simple dashboards).
//   - `panel`:    single card fills the viewport (map, camera, alarm).
//
// Card rendering is always through <CardRenderer> — the same code path the
// editor preview, a/b tests, and the future LLM-composed dashboards all use.
// The shell deliberately has no card-type-specific code.
//
// Navigation + more-info handlers come from props so the route layer decides
// (Next.js router vs Capacitor deep-link vs test stub).
// ---------------------------------------------------------------------------

import type { DashboardDoc, DashboardSection } from '@ha/shared';
import { CardRenderer, CardHandlersProvider } from '@/components/cards';
import type { DeviceCommandHandlers } from '@/hooks/useDeviceCommand';
import { token } from '@/lib/tokens';

interface DashboardViewProps {
  doc: DashboardDoc;
  handlers?: DeviceCommandHandlers;
}

export function DashboardView({ doc, handlers = {} }: DashboardViewProps) {
  return (
    <CardHandlersProvider handlers={handlers}>
      <div className="min-h-full px-4 py-4 lg:px-6 lg:py-6" data-dashboard-path={doc.path}>
        {doc.title && (
          <h1 className="mb-4 text-2xl font-semibold" style={{ color: token('--color-text') }}>
            {doc.title}
          </h1>
        )}
        <DashboardBody doc={doc} />
      </div>
    </CardHandlersProvider>
  );
}

function DashboardBody({ doc }: { doc: DashboardDoc }) {
  const layout = doc.layout.type;

  if (layout === 'panel') {
    const first = doc.cards[0];
    return first ? <CardRenderer card={first} /> : <EmptyState />;
  }

  if (layout === 'stack') {
    if (doc.cards.length === 0) return <EmptyState />;
    return (
      <div className="flex flex-col gap-3">
        {doc.cards.map((c, i) => (
          <CardRenderer key={c.id ?? `${c.type}-${i}`} card={c} />
        ))}
      </div>
    );
  }

  // sections
  const maxCols = Math.min(doc.layout.maxColumns, 6);
  return (
    <div
      className="grid gap-4"
      style={{
        // auto-fit collapses empty columns on narrow viewports; a fixed minmax
        // keeps section width consistent across dashboards on the same tablet.
        gridTemplateColumns: `repeat(auto-fit, minmax(min(320px, 100%), ${100 / maxCols}%))`,
      }}
    >
      {doc.sections.length === 0 ? <EmptyState /> : doc.sections.map((s, i) => (
        <SectionColumn key={s.id ?? `section-${i}`} section={s} />
      ))}
    </div>
  );
}

function SectionColumn({ section }: { section: DashboardSection }) {
  return (
    <div
      className="flex flex-col gap-3 rounded-lg p-3"
      style={{
        background: token('--color-bg-secondary'),
        border: `1px solid ${token('--color-border')}`,
      }}
      data-section-id={section.id}
    >
      {section.title && (
        <h2 className="text-base font-medium" style={{ color: token('--color-text') }}>
          {section.title}
        </h2>
      )}
      {section.cards.map((c, i) => (
        <CardRenderer key={c.id ?? `${c.type}-${i}`} card={c} />
      ))}
    </div>
  );
}

function EmptyState() {
  return (
    <div
      className="rounded-lg p-6 text-sm"
      style={{
        background: token('--color-bg-card'),
        color: token('--color-text-muted'),
        border: `1px dashed ${token('--color-border')}`,
      }}
    >
      This dashboard has no cards yet. Use the editor to add some.
    </div>
  );
}
