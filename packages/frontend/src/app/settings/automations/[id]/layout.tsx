/** Static export (Capacitor bundle): see `devices/[id]/layout.tsx` for caveats. */
export function generateStaticParams() {
  return [{ id: 'placeholder' }];
}

export default function AutomationIdLayout({ children }: { children: React.ReactNode }) {
  return children;
}
