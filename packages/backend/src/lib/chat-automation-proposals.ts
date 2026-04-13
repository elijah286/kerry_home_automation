// ---------------------------------------------------------------------------
// Pending automation edits for chat assistant (two-step confirm)
// ---------------------------------------------------------------------------

import type { AutomationCreate, AutomationUpdate } from '@ha/shared';

export type PendingAutomationOp =
  | { action: 'create'; body: AutomationCreate }
  | { action: 'update'; id: string; body: AutomationUpdate }
  | { action: 'delete'; id: string };

interface PendingRecord {
  userId: string;
  expiresAt: number;
  op: PendingAutomationOp;
  summary: string;
}

const store = new Map<string, PendingRecord>();
const TTL_MS = 15 * 60 * 1000;
const MAX_PER_USER = 5;

function prune(): void {
  const now = Date.now();
  for (const [k, v] of store) {
    if (v.expiresAt < now) store.delete(k);
  }
}

function countForUser(userId: string): number {
  let n = 0;
  for (const v of store.values()) {
    if (v.userId === userId) n += 1;
  }
  return n;
}

export function saveAutomationProposal(userId: string, op: PendingAutomationOp, summary: string): string {
  prune();
  if (countForUser(userId) >= MAX_PER_USER) {
    throw new Error('Too many pending automation proposals. Commit or cancel one, or wait for expiry (15 min).');
  }
  const id = crypto.randomUUID();
  store.set(id, { userId, expiresAt: Date.now() + TTL_MS, op, summary });
  return id;
}

export function takeAutomationProposal(proposalId: string, userId: string): PendingRecord | null {
  prune();
  const r = store.get(proposalId);
  if (!r || r.expiresAt < Date.now() || r.userId !== userId) return null;
  store.delete(proposalId);
  return r;
}
