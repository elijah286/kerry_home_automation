'use client';

import Image from 'next/image';

/** Intrinsic size of `public/ufp-emblem.jpg` (United Federation of Planets emblem). */
const INTRINSIC_W = 1024;
const INTRINSIC_H = 484;

export function UfpEmblemLogo({
  maxWidth = 320,
  className,
  priority,
}: {
  /** CSS max-width in pixels (image scales down, keeps aspect ratio). */
  maxWidth?: number;
  className?: string;
  priority?: boolean;
}) {
  return (
    <Image
      src="/ufp-emblem.jpg"
      alt="United Federation of Planets"
      width={INTRINSIC_W}
      height={INTRINSIC_H}
      priority={priority}
      className={className}
      style={{ width: '100%', maxWidth, height: 'auto' }}
    />
  );
}
