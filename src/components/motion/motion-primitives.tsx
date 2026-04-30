'use client';

/**
 * Motion Primitives — reusable animation building blocks.
 *
 * These wrap framer-motion with opinionated defaults that respect
 * prefers-reduced-motion, so every page gets consistent, accessible motion
 * "for free". Prefer these over raw <motion.div> in app code.
 */

import React from 'react';
import {
  motion,
  AnimatePresence,
  useReducedMotion,
  useMotionValue,
  useSpring,
  useTransform,
  useInView,
  type Variants,
  type Transition,
  type MotionProps,
} from 'framer-motion';

// ── Shared transition presets ─────────────────────────────────────────────

/** Crisp, responsive spring used for most UI interactions (hover/tap). */
export const springSnappy: Transition = { type: 'spring', stiffness: 400, damping: 30, mass: 0.6 };

/** Softer spring for larger elements (drawers, pages). */
export const springSoft: Transition = { type: 'spring', stiffness: 220, damping: 26 };

/** Short tween for subtle fades (skeleton → content). */
export const easeShort: Transition = { duration: 0.22, ease: [0.2, 0.8, 0.2, 1] };

/** Medium tween for list/card entry. */
export const easeMed: Transition = { duration: 0.35, ease: [0.2, 0.8, 0.2, 1] };

// ── FadeIn ────────────────────────────────────────────────────────────────

type FadeInProps = {
  children: React.ReactNode;
  delay?: number;
  y?: number;
  className?: string;
  motionAs?: keyof JSX.IntrinsicElements;
};

/** Fade + subtle rise. Use for any page content block. */
export function FadeIn({ children, delay = 0, y = 8, className, motionAs = 'div' }: FadeInProps) {
  const reduce = useReducedMotion();
  const Comp = motion[motionAs as 'div']; // eslint-disable-line @typescript-eslint/no-explicit-any
  return (
    <Comp
      initial={reduce ? false : { opacity: 0, y }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ ...easeMed, delay }}
      className={className}
    >
      {children}
    </Comp>
  );
}

// ── StaggerList ───────────────────────────────────────────────────────────

type StaggerListProps = {
  children: React.ReactNode;
  /** Delay between children in seconds. */
  stagger?: number;
  /** Initial delay before first child. */
  delay?: number;
  className?: string;
};

/**
 * Animates its direct children in sequence. Each child should be wrapped in
 * <StaggerItem> (or use motion.div directly with the item variants).
 */
export function StaggerList({ children, stagger = 0.05, delay = 0, className }: StaggerListProps) {
  const reduce = useReducedMotion();
  const container: Variants = {
    hidden: { opacity: reduce ? 1 : 0 },
    show: {
      opacity: 1,
      transition: {
        staggerChildren: reduce ? 0 : stagger,
        delayChildren: reduce ? 0 : delay,
      },
    },
  };
  return (
    <motion.div variants={container} initial="hidden" animate="show" className={className}>
      {children}
    </motion.div>
  );
}

export const staggerItemVariants: Variants = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0, transition: { ...easeMed } },
};

type StaggerItemProps = {
  children: React.ReactNode;
  className?: string;
} & Omit<MotionProps, 'variants' | 'initial' | 'animate'>;

export function StaggerItem({ children, className, ...rest }: StaggerItemProps) {
  return (
    <motion.div variants={staggerItemVariants} className={className} {...rest}>
      {children}
    </motion.div>
  );
}

// ── PageTransition ────────────────────────────────────────────────────────

/**
 * Wraps page content so it fades+slides when the route changes.
 * Use `key={pathname}` on the parent AnimatePresence.
 */
export function PageTransition({ children, className }: { children: React.ReactNode; className?: string }) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={reduce ? undefined : { opacity: 0, y: -4 }}
      transition={easeMed}
      className={className}
    >
      {children}
    </motion.div>
  );
}

// ── CountUp ───────────────────────────────────────────────────────────────

type CountUpProps = {
  /** Final numeric value. */
  value: number;
  /** Duration in seconds. */
  duration?: number;
  /** Number of decimal places. */
  decimals?: number;
  /** Format function (e.g. toLocaleString). Overrides decimals. */
  format?: (n: number) => string;
  className?: string;
  prefix?: string;
  suffix?: string;
};

/**
 * Animates a number from 0 → value when it enters the viewport.
 * Uses requestAnimationFrame with an ease-out curve for a natural ticker feel.
 */
export function CountUp({
  value,
  duration = 1.2,
  decimals = 0,
  format,
  className,
  prefix = '',
  suffix = '',
}: CountUpProps) {
  const reduce = useReducedMotion();
  const ref = React.useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.5 });
  const fmt = React.useCallback(
    (n: number) => (format ? format(n) : n.toFixed(decimals)),
    [format, decimals]
  );
  const [display, setDisplay] = React.useState(() => (reduce ? fmt(value) : fmt(0)));

  React.useEffect(() => {
    if (reduce) {
      setDisplay(fmt(value));
      return;
    }
    if (!inView) return;
    let raf = 0;
    const start = performance.now();
    const ms = Math.max(100, duration * 1000);
    const from = 0;
    const to = value;
    const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / ms);
      setDisplay(fmt(from + (to - from) * easeOut(t)));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [inView, value, reduce, duration, fmt]);

  return (
    <span ref={ref} className={className}>
      {prefix}
      {display}
      {suffix}
    </span>
  );
}

// ── MagneticCard ──────────────────────────────────────────────────────────

type MagneticCardProps = {
  children: React.ReactNode;
  className?: string;
  /** Max tilt in degrees. 0 disables tilt, useful for small cards. */
  tilt?: number;
  /** Max lift (px) on hover. */
  lift?: number;
  /** Strength of cursor-follow (0 = none, 1 = full). */
  magnet?: number;
};

/**
 * Card that subtly tilts toward the cursor and lifts on hover.
 * Perfect for KPI cards and dashboard tiles. Auto-disables on touch + reduced motion.
 */
export function MagneticCard({
  children,
  className,
  tilt = 4,
  lift = 4,
  magnet = 0.15,
}: MagneticCardProps) {
  const reduce = useReducedMotion();
  const ref = React.useRef<HTMLDivElement>(null);
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const rX = useSpring(useTransform(y, [-0.5, 0.5], [tilt, -tilt]), { stiffness: 300, damping: 24 });
  const rY = useSpring(useTransform(x, [-0.5, 0.5], [-tilt, tilt]), { stiffness: 300, damping: 24 });
  const mX = useSpring(useTransform(x, [-0.5, 0.5], [-8 * magnet, 8 * magnet]), {
    stiffness: 300,
    damping: 24,
  });
  const mY = useSpring(useTransform(y, [-0.5, 0.5], [-8 * magnet, 8 * magnet]), {
    stiffness: 300,
    damping: 24,
  });

  function onMouseMove(e: React.MouseEvent<HTMLDivElement>) {
    if (reduce) return;
    const r = ref.current?.getBoundingClientRect();
    if (!r) return;
    x.set((e.clientX - r.left) / r.width - 0.5);
    y.set((e.clientY - r.top) / r.height - 0.5);
  }
  function onMouseLeave() {
    x.set(0);
    y.set(0);
  }

  if (reduce) {
    return <div className={className}>{children}</div>;
  }

  return (
    <motion.div
      ref={ref}
      onMouseMove={onMouseMove}
      onMouseLeave={onMouseLeave}
      whileHover={{ y: -lift }}
      transition={springSnappy}
      style={{ rotateX: rX, rotateY: rY, x: mX, y: mY, transformPerspective: 1000 }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

// ── Reveal ────────────────────────────────────────────────────────────────

/** Fades a section in when it scrolls into view. */
export function Reveal({
  children,
  className,
  y = 16,
  once = true,
}: {
  children: React.ReactNode;
  className?: string;
  y?: number;
  once?: boolean;
}) {
  const reduce = useReducedMotion();
  const ref = React.useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once, amount: 0.2 });
  return (
    <motion.div
      ref={ref}
      initial={reduce ? false : { opacity: 0, y }}
      animate={inView ? { opacity: 1, y: 0 } : { opacity: 0, y }}
      transition={easeMed}
      className={className}
    >
      {children}
    </motion.div>
  );
}

// ── PressableButton ───────────────────────────────────────────────────────

type PressableProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  children: React.ReactNode;
};

/**
 * Button wrapper that adds spring hover/tap feedback without changing styles.
 * Drop-in replacement for any <button> where you want motion feedback.
 */
export const Pressable = React.forwardRef<HTMLButtonElement, PressableProps>(function Pressable(
  { children, className, ...rest },
  ref
) {
  const reduce = useReducedMotion();
  if (reduce) {
    return (
      <button ref={ref} className={className} {...rest}>
        {children}
      </button>
    );
  }
  return (
    <motion.button
      ref={ref}
      whileHover={{ y: -1 }}
      whileTap={{ scale: 0.97, y: 0 }}
      transition={springSnappy}
      className={className}
      // Framer Motion's onDrag conflicts with native HTML button's onDrag
      // (native uses DragEvent, motion uses PanInfo-based handler) — safe cast
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      {...(rest as any)}
    >
      {children}
    </motion.button>
  );
});

// ── Re-exports for convenience ────────────────────────────────────────────
export { AnimatePresence, motion, useReducedMotion };
