'use client';

// ---------------------------------------------------------------------------
// IframeSandboxCard — embeds an https URL in a sandboxed iframe.
//
// The schema already enforces https-only at parse time. We apply a strict
// `sandbox` attribute (no-same-origin, no-top-navigation) so the embed can't
// escape into the parent document, and `referrerPolicy="no-referrer"` so the
// embed doesn't leak which dashboard loaded it.
//
// `aspectRatio` (`"16:9"`, `"4:3"`, …) is rendered via CSS aspect-ratio so
// the iframe keeps proportion on any dashboard grid.
// ---------------------------------------------------------------------------

import { token } from '@/lib/tokens';

type IframeSandboxCardDescriptor = {
  type: 'iframe-sandbox';
  url: string;
  title?: string;
  aspectRatio?: string;
};

export function IframeSandboxCard({ card }: { card: IframeSandboxCardDescriptor }) {
  const ratio = parseAspect(card.aspectRatio);

  return (
    <div
      className="overflow-hidden rounded-lg"
      style={{
        background: token('--color-bg-card'),
        border: `1px solid ${token('--color-border')}`,
      }}
      data-card-type="iframe-sandbox"
    >
      {card.title && (
        <div
          className="truncate px-3 py-1.5 text-xs font-medium"
          style={{
            color: token('--color-text-secondary'),
            borderBottom: `1px solid ${token('--color-border')}`,
            background: token('--color-bg-secondary'),
          }}
        >
          {card.title}
        </div>
      )}
      <div style={{ aspectRatio: ratio }}>
        <iframe
          src={card.url}
          title={card.title ?? card.url}
          // Minimal permissions: allow scripts + forms (most embeds need them)
          // but keep same-origin and top-navigation out. Popups stay enabled
          // so "open in new tab" links in an embed still work.
          sandbox="allow-scripts allow-forms allow-popups"
          referrerPolicy="no-referrer"
          loading="lazy"
          className="h-full w-full border-0"
          style={{ background: token('--color-bg') }}
        />
      </div>
    </div>
  );
}

// Accept "16:9", "4:3" — schema regex already guarantees this shape; we
// still guard because the schema is at the boundary and a stray `undefined`
// should render a sensible default.
function parseAspect(s: string | undefined): string {
  if (!s) return '16 / 9';
  const [w, h] = s.split(':').map(Number);
  if (!Number.isFinite(w) || !Number.isFinite(h) || !w || !h) return '16 / 9';
  return `${w} / ${h}`;
}
