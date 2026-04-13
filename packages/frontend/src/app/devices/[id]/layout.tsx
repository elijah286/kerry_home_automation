/**
 * Required for `output: export` (Capacitor static bundle). Unknown `id` values are still
 * handled client-side when navigating inside the app; opening a cold URL to a new id may 404
 * unless that id was pre-rendered. Prefer loading the UI from a Next server via Capacitor
 * `server.url` when deep links to dynamic routes matter.
 */
export function generateStaticParams() {
  return [{ id: 'placeholder' }];
}

export default function DeviceIdLayout({ children }: { children: React.ReactNode }) {
  return children;
}
