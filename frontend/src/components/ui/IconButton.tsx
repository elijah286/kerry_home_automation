'use client';

import { type ElementType, useCallback, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';

type IconButtonVariant = 'default' | 'primary' | 'danger';
type IconButtonSize = 'sm' | 'md' | 'lg';

interface IconButtonProps {
  icon: ElementType;
  label: string;
  onClick?: () => void;
  active?: boolean;
  variant?: IconButtonVariant;
  size?: IconButtonSize;
  className?: string;
}

const sizeConfig: Record<IconButtonSize, { button: string; icon: number; text: string }> = {
  sm: { button: 'w-14 h-14', icon: 18, text: 'text-[10px]' },
  md: { button: 'w-18 h-18', icon: 22, text: 'text-xs' },
  lg: { button: 'w-22 h-22', icon: 26, text: 'text-sm' },
};

const variantStyles: Record<IconButtonVariant, { active: string; inactive: string }> = {
  default: {
    active: 'bg-white/10 text-zinc-100',
    inactive: 'bg-white/[0.04] text-zinc-500 hover:bg-white/[0.08] hover:text-zinc-300',
  },
  primary: {
    active: 'bg-accent/20 text-accent shadow-[0_0_16px_rgba(59,130,246,0.2)]',
    inactive: 'bg-white/[0.04] text-zinc-500 hover:bg-accent/10 hover:text-accent',
  },
  danger: {
    active: 'bg-red-500/20 text-red-400 shadow-[0_0_16px_rgba(239,68,68,0.2)]',
    inactive: 'bg-white/[0.04] text-zinc-500 hover:bg-red-500/10 hover:text-red-400',
  },
};

interface Ripple {
  id: number;
  x: number;
  y: number;
}

export function IconButton({
  icon: Icon,
  label,
  onClick,
  active = false,
  variant = 'default',
  size = 'md',
  className,
}: IconButtonProps) {
  const cfg = sizeConfig[size];
  const styles = variantStyles[variant];
  const [ripples, setRipples] = useState<Ripple[]>([]);
  const idRef = useRef(0);

  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      const rect = e.currentTarget.getBoundingClientRect();
      const id = ++idRef.current;
      setRipples((prev) => [
        ...prev,
        { id, x: e.clientX - rect.left, y: e.clientY - rect.top },
      ]);
      setTimeout(() => setRipples((prev) => prev.filter((r) => r.id !== id)), 600);
      onClick?.();
    },
    [onClick]
  );

  return (
    <motion.button
      whileTap={{ scale: 0.92 }}
      onClick={handleClick}
      className={cn(
        'relative flex flex-col items-center justify-center gap-1 rounded-2xl overflow-hidden transition-colors duration-200',
        cfg.button,
        active ? styles.active : styles.inactive,
        className
      )}
    >
      <AnimatePresence>
        {ripples.map((r) => (
          <motion.span
            key={r.id}
            initial={{ scale: 0, opacity: 0.35 }}
            animate={{ scale: 2.5, opacity: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.6 }}
            className="absolute rounded-full bg-white/20 pointer-events-none"
            style={{
              width: 40,
              height: 40,
              left: r.x - 20,
              top: r.y - 20,
            }}
          />
        ))}
      </AnimatePresence>
      <Icon size={cfg.icon} strokeWidth={1.8} />
      <span className={cn(cfg.text, 'font-medium leading-tight')}>{label}</span>
    </motion.button>
  );
}
