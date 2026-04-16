'use client';

// ---------------------------------------------------------------------------
// useCameraSlot — React-friendly wrapper around the CameraCoordinator.
//
// The CameraCard calls this with its entity id and a ref to its container.
// The hook wires an IntersectionObserver so off-screen cameras release their
// MSE slot automatically, and returns `hasSlot` which the card uses to pick
// between <video> (live) and <img> (snapshot fallback).
// ---------------------------------------------------------------------------

import { useEffect, useRef, useState, type RefObject } from 'react';
import { cameraCoordinator } from '@/lib/camera-coordinator';

export interface UseCameraSlotOptions {
  /** Higher = prefer this camera keep its slot under pressure. */
  priority?: number;
  /**
   * If false, skip coordinator registration entirely (e.g. `mode: 'snapshot'`
   * forced by card config). Returned `hasSlot` stays `false`.
   */
  enabled?: boolean;
}

export function useCameraSlot(
  entityId: string,
  containerRef: RefObject<HTMLElement | null>,
  { priority = 0, enabled = true }: UseCameraSlotOptions = {},
): boolean {
  const [hasSlot, setHasSlot] = useState(false);
  // Keep a ref so the coordinator callback always reads the latest setter.
  const setHasSlotRef = useRef(setHasSlot);
  setHasSlotRef.current = setHasSlot;

  useEffect(() => {
    if (!enabled) { setHasSlot(false); return; }
    const el = containerRef.current;

    // Begin as visible until the observer says otherwise. This matches the
    // intuitive ordering — a newly mounted card that sits above the fold gets
    // a slot immediately without waiting for the observer's first callback.
    const unregister = cameraCoordinator.request(
      entityId,
      (granted) => setHasSlotRef.current(granted),
      { visible: true, priority },
    );

    let observer: IntersectionObserver | null = null;
    if (el && typeof IntersectionObserver !== 'undefined') {
      observer = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            cameraCoordinator.update(entityId, { visible: entry.isIntersecting });
          }
        },
        { threshold: 0.1 },
      );
      observer.observe(el);
    }

    return () => {
      observer?.disconnect();
      unregister();
    };
  }, [entityId, enabled, priority, containerRef]);

  return hasSlot;
}
