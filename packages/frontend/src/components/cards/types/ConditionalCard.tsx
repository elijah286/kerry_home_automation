'use client';

import type { ConditionalCard as ConditionalCardDescriptor, ConditionExpr, DeviceState } from '@ha/shared';
import { useDevices, type DeviceSelector } from '@/hooks/useDevices';
import { useCallback } from 'react';
import { CardRenderer } from '../CardRenderer';

// A conditional card is cheap if we subscribe only to the entities its
// condition references. We walk the expression once to collect those ids, use
// `useDevices` for a filtered subscription, and evaluate synchronously.
export function ConditionalCard({ card }: { card: ConditionalCardDescriptor }) {
  const referencedIds = collectEntityIds(card.when);

  const selector: DeviceSelector = useCallback(
    (all) => all.filter((d) => referencedIds.has(d.id)),
    // Set identity is stable per render — encode it as a sorted join so the
    // selector is stable across re-renders with the same card.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [[...referencedIds].sort().join('|')],
  );

  const devices = useDevices(selector);
  const byId = new Map(devices.map((d) => [d.id, d]));
  const result = evaluate(card.when, byId);

  if (result) return <CardRenderer card={card.then} />;
  if (card.else) return <CardRenderer card={card.else} />;
  return null;
}

function collectEntityIds(expr: ConditionExpr, acc: Set<string> = new Set()): Set<string> {
  switch (expr.type) {
    case 'and':
    case 'or':
      for (const c of expr.conditions) collectEntityIds(c, acc);
      return acc;
    case 'not':
      collectEntityIds(expr.condition, acc);
      return acc;
    case 'user':
      return acc;
    default:
      if ('entity' in expr && expr.entity) acc.add(expr.entity);
      return acc;
  }
}

function evaluate(expr: ConditionExpr, byId: Map<string, DeviceState>): boolean {
  switch (expr.type) {
    case 'and':  return expr.conditions.every((c) => evaluate(c, byId));
    case 'or':   return expr.conditions.some((c) => evaluate(c, byId));
    case 'not':  return !evaluate(expr.condition, byId);
    case 'user': {
      // Session-scoped conditions are handled by the auth provider, not here.
      // Default-allow so the conditional card isn't a silent hide when a card
      // is authored without session context.
      return true;
    }
    case 'state': {
      const d = byId.get(expr.entity);
      const state = readCanonicalState(d);
      return String(state) === String(expr.equals);
    }
    case 'state-in': {
      const d = byId.get(expr.entity);
      const state = readCanonicalState(d);
      return expr.values.some((v) => String(state) === String(v));
    }
    case 'attribute': {
      const d = byId.get(expr.entity) as unknown as Record<string, unknown> | undefined;
      return d ? String(d[expr.attribute]) === String(expr.equals) : false;
    }
    case 'numeric-state': {
      const d = byId.get(expr.entity) as unknown as Record<string, unknown> | undefined;
      if (!d) return false;
      const raw = expr.attribute ? d[expr.attribute] : readCanonicalState(d as unknown as DeviceState);
      const n = typeof raw === 'number' ? raw : Number(raw);
      if (!Number.isFinite(n)) return false;
      switch (expr.op) {
        case 'gt':  return n >  expr.value;
        case 'lt':  return n <  expr.value;
        case 'gte': return n >= expr.value;
        case 'lte': return n <= expr.value;
        case 'eq':  return n === expr.value;
        case 'neq': return n !== expr.value;
      }
      return false;
    }
    case 'available': {
      const d = byId.get(expr.entity);
      return Boolean(d?.available) === expr.available;
    }
  }
}

function readCanonicalState(device: DeviceState | undefined): string | number | boolean | undefined {
  if (!device) return undefined;
  const d = device as unknown as Record<string, unknown>;
  // Common canonical state fields in priority order.
  for (const key of ['state', 'on', 'locked', 'armed', 'moving', 'power', 'mode']) {
    const v = d[key];
    if (v !== undefined) return v as string | number | boolean;
  }
  return undefined;
}
