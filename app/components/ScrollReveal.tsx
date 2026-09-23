import {useEffect, useRef, type ReactNode} from 'react';
import {gsap} from 'gsap';
import {ScrollTrigger} from 'gsap/ScrollTrigger';

function prefersReducedMotion() {
  return (
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

/** Fades + slides a single element up as it scrolls into view. */
export function ScrollFade({
  children,
  className,
  y = 32,
  duration = 0.9,
  start = 'top 85%',
}: {
  children: ReactNode;
  className?: string;
  y?: number;
  duration?: number;
  start?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || prefersReducedMotion()) return;

    gsap.registerPlugin(ScrollTrigger);
    const ctx = gsap.context(() => {
      gsap.fromTo(
        el,
        {opacity: 0, y},
        {
          opacity: 1,
          y: 0,
          duration,
          ease: 'power3.out',
          scrollTrigger: {
            trigger: el,
            start,
            toggleActions: 'play none none reverse',
          },
        },
      );
    });

    return () => ctx.revert();
  }, [y, duration, start]);

  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  );
}

/** Fades + slides a container's direct children up in a stagger as the container scrolls into view. */
export function ScrollStagger({
  children,
  className,
  y = 28,
  duration = 0.7,
  stagger = 0.08,
  start = 'top 88%',
}: {
  children: ReactNode;
  className?: string;
  y?: number;
  duration?: number;
  stagger?: number;
  start?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || !el.children.length || prefersReducedMotion()) return;

    gsap.registerPlugin(ScrollTrigger);
    const ctx = gsap.context(() => {
      gsap.fromTo(
        el.children,
        {opacity: 0, y},
        {
          opacity: 1,
          y: 0,
          duration,
          stagger,
          ease: 'power3.out',
          scrollTrigger: {
            trigger: el,
            start,
            toggleActions: 'play none none reverse',
          },
        },
      );
    });

    return () => ctx.revert();
    // Re-run once children arrive (e.g. after a deferred Suspense/Await resolves).
  }, [children, y, duration, stagger, start]);

  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  );
}
