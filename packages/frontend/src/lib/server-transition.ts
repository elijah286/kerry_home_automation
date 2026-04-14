/** sessionStorage key — survives SPA navigation; cleared when /api/health is OK again. */
export const SERVER_TRANSITION_STORAGE_KEY = 'ha-ui-awaiting-server-transition';

export type ServerTransitionKind = 'reboot' | 'update';

export function readServerTransitionPending(): ServerTransitionKind | null {
  if (typeof window === 'undefined') return null;
  const v = sessionStorage.getItem(SERVER_TRANSITION_STORAGE_KEY);
  if (v === 'reboot' || v === 'update') return v;
  return null;
}

export function clearServerTransitionPending(): void {
  if (typeof window === 'undefined') return;
  sessionStorage.removeItem(SERVER_TRANSITION_STORAGE_KEY);
}

/** Call after the server acknowledges a reboot/update so the UI locks immediately. */
export function signalServerTransitionPending(kind: ServerTransitionKind): void {
  if (typeof window === 'undefined') return;
  sessionStorage.setItem(SERVER_TRANSITION_STORAGE_KEY, kind);
  window.dispatchEvent(
    new CustomEvent<{ kind: ServerTransitionKind }>('ha-server-transition-pending', { detail: { kind } }),
  );
}
