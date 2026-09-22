import {Suspense, lazy, useEffect, useLayoutEffect, useRef, useState} from 'react';
import {gsap} from 'gsap';
import {ScrollTrigger} from 'gsap/ScrollTrigger';

const HeroScene = lazy(() =>
  import('./HeroScene').then((mod) => ({default: mod.HeroScene})),
);

// This component is SSR'd (only the WebGL canvas is client-only), so a plain
// useLayoutEffect would warn on the server. Fall back to useEffect there.
const useIsomorphicLayoutEffect =
  typeof window === 'undefined' ? useEffect : useLayoutEffect;

function hasWebGL(): boolean {
  try {
    const canvas = document.createElement('canvas');
    return Boolean(
      window.WebGLRenderingContext &&
        (canvas.getContext('webgl') || canvas.getContext('experimental-webgl')),
    );
  } catch {
    return false;
  }
}

export interface Hero3DProps {
  eyebrow?: string;
  title?: string;
  subtitle?: string;
  ctaLabel?: string;
  ctaHref?: string;
}

export function Hero3D({
  eyebrow = 'ALZARA DETAILING',
  title = 'Engineered shine.\nBuilt to last.',
  subtitle = 'Ceramic-grade care, formulated for cars that deserve more than a wash.',
  ctaLabel = 'Shop ceramic care',
  ctaHref = '/collections/all',
}: Hero3DProps) {
  const sectionRef = useRef<HTMLElement>(null);
  const canvasWrapRef = useRef<HTMLDivElement>(null);
  const eyebrowRef = useRef<HTMLSpanElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const subtitleRef = useRef<HTMLParagraphElement>(null);
  const ctaRef = useRef<HTMLAnchorElement>(null);

  const [canRender3D, setCanRender3D] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [pointerFine, setPointerFine] = useState(false);

  // WebGL support, reduced-motion and pointer type can only be known
  // client-side. All start "off" so server/client first render match (no
  // hydration mismatch). `pointer: fine` excludes touch/coarse pointers —
  // the bottle-tilt interaction should never try to run on mobile.
  useEffect(() => {
    setCanRender3D(hasWebGL());

    const motionMedia = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReducedMotion(motionMedia.matches);
    const handleMotionChange = (event: MediaQueryListEvent) =>
      setReducedMotion(event.matches);
    motionMedia.addEventListener('change', handleMotionChange);

    const pointerMedia = window.matchMedia('(pointer: fine)');
    setPointerFine(pointerMedia.matches);
    const handlePointerChange = (event: MediaQueryListEvent) =>
      setPointerFine(event.matches);
    pointerMedia.addEventListener('change', handlePointerChange);

    return () => {
      motionMedia.removeEventListener('change', handleMotionChange);
      pointerMedia.removeEventListener('change', handlePointerChange);
    };
  }, []);

  useIsomorphicLayoutEffect(() => {
    const els = [
      eyebrowRef.current,
      titleRef.current,
      subtitleRef.current,
      ctaRef.current,
      canvasWrapRef.current,
    ].filter(Boolean) as HTMLElement[];
    if (!els.length) return;

    if (reducedMotion) {
      gsap.set(els, {opacity: 1, y: 0, scale: 1});
      return;
    }

    const ctx = gsap.context(() => {
      gsap.set(els, {opacity: 0});
      const tl = gsap.timeline({defaults: {ease: 'power3.out'}});
      tl.fromTo(eyebrowRef.current, {y: 14}, {opacity: 1, y: 0, duration: 0.6}, 0.1)
        .fromTo(titleRef.current, {y: 26}, {opacity: 1, y: 0, duration: 0.9}, 0.22)
        .fromTo(subtitleRef.current, {y: 18}, {opacity: 1, y: 0, duration: 0.8}, 0.4)
        .fromTo(ctaRef.current, {y: 14}, {opacity: 1, y: 0, duration: 0.7}, 0.55)
        .fromTo(
          canvasWrapRef.current,
          {opacity: 0, scale: 0.94, y: 18},
          {opacity: 1, scale: 1, y: 0, duration: 1.1},
          0.3,
        );
    }, sectionRef);

    return () => ctx.revert();
  }, [reducedMotion]);

  // Simple exit fade as the hero scrolls out. `self.progress` (0-1) is the
  // hook point for a future scroll-driven 3D scene sequence.
  useEffect(() => {
    if (reducedMotion || !sectionRef.current) return;

    gsap.registerPlugin(ScrollTrigger);
    const trigger = ScrollTrigger.create({
      trigger: sectionRef.current,
      start: 'top top',
      end: 'bottom top',
      scrub: true,
      onUpdate: (self) => {
        gsap.set(sectionRef.current, {opacity: 1 - self.progress * 0.7});
      },
    });

    return () => trigger.kill();
  }, [reducedMotion]);

  return (
    <section
      ref={sectionRef}
      className="hero3d relative flex min-h-screen w-full flex-col overflow-hidden bg-[#08090b] text-[#f5f2ea] md:flex-row md:items-center"
    >
      <div className="hero3d-glow" aria-hidden="true" />

      <div className="relative z-10 order-2 flex w-full flex-col justify-center px-6 pb-12 pt-10 md:order-1 md:w-[45%] md:px-16 md:py-0 lg:px-20">
        <span
          ref={eyebrowRef}
          className="mb-5 text-xs font-semibold uppercase tracking-[0.4em] text-[#c9a24b]"
        >
          {eyebrow}
        </span>
        <h1
          ref={titleRef}
          className="whitespace-pre-line text-4xl font-semibold leading-[1.02] tracking-[-0.02em] sm:text-5xl sm:leading-[0.98] md:text-7xl lg:text-[5.5rem]"
        >
          {title}
        </h1>
        <p
          ref={subtitleRef}
          className="mt-7 max-w-md text-base leading-relaxed text-[#d8d5cc] md:text-lg"
        >
          {subtitle}
        </p>
        <a
          ref={ctaRef}
          href={ctaHref}
          className="mt-11 inline-flex w-fit items-center gap-3 bg-[#f5f2ea] px-8 py-4 text-sm font-semibold uppercase tracking-[0.22em] text-[#0a0b0d] transition-colors duration-300 hover:bg-[#c9a24b]"
        >
          {ctaLabel}
          <span aria-hidden="true">&rarr;</span>
        </a>
      </div>

      <div
        ref={canvasWrapRef}
        className="relative order-1 h-[52vh] w-full md:order-2 md:h-full md:w-[55%]"
      >
        <div className="hero3d-canvas-glow" aria-hidden="true" />
        {canRender3D ? (
          <Suspense fallback={<div className="hero3d-loading" aria-hidden="true" />}>
            <HeroScene pointerFine={pointerFine} reducedMotion={reducedMotion} />
          </Suspense>
        ) : (
          <div className="hero3d-fallback" role="img" aria-label={eyebrow}>
            <div className="hero3d-fallback-bottle" />
          </div>
        )}
      </div>
    </section>
  );
}
