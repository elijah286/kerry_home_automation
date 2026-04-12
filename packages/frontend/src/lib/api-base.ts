/** Backend origin for browser fetches (must match cookie scope for auth). */
export function getApiBase(): string {
  if (typeof window === 'undefined') {
    return process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';
  }
  return process.env.NEXT_PUBLIC_API_URL ?? `http://${window.location.hostname}:3000`;
}
