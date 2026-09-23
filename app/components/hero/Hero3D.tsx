import {Suspense, lazy, useCallback, useEffect, useRef, useState} from 'react';
import {gsap} from 'gsap';
import {ScrollTrigger} from 'gsap/ScrollTrigger';

const HeroScene = lazy(() =>
  import('./HeroScene').then((mod) => ({default: mod.HeroScene})),
);

/** Static render of the 3D bottle, shown instantly while WebGL loads. */
const POSTER_SRC = '/images/hero-bottle.webp';

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
  eyebrow = 'AUTOCARE EXPRESS',
  title = 'Brillo de precisión.\nHecho para durar.',
  subtitle = 'Cuidado de grado profesional, formulado para coches que merecen algo más que un lavado.',
  ctaLabel = 'Descubrir productos',
  ctaHref = '/collections/all',
}: Hero3DProps) {
  const sectionRef = useRef<HTMLElement>(null);
  const canvasWrapRef = useRef<HTMLDivElement>(null);

  const [canRender3D, setCanRender3D] = useState(false);
  const [sceneReady, setSceneReady] = useState(false);
  const [inView, setInView] = useState(true);
  const handleSceneReady = useCallback(() => setSceneReady(true), []);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [pointerFine, setPointerFine] = useState(false);

  // WebGL support, reduced-motion and pointer type can only be known
  // client-side. All start "off" so server/client first render match (no
  // hydration mismatch). `pointer: fine` excludes touch/coarse pointers —
  // the bottle-tilt interaction should never try to run on mobile.
  useEffect(() => {
    // The poster already shows the bottle, so the ~1 MB of 3D (engine +
    // model) waits until the page is loaded and the browser is idle, and is
    // skipped entirely for data-saver users.
    const connection = (
      navigator as Navigator & {
        connection?: {saveData?: boolean};
      }
    ).connection;
    let idleId: number | undefined;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    const start3D = () => {
      const run = () => setCanRender3D(hasWebGL());
      if ('requestIdleCallback' in window) {
        idleId = window.requestIdleCallback(run, {timeout: 1500});
      } else {
        timeoutId = globalThis.setTimeout(run, 300);
      }
    };
    // Touch devices get no tilt interaction, so the 3D adds nothing the
    // poster doesn't already show: keep the poster (with a CSS float) there.
    const finePointer = window.matchMedia('(pointer: fine)').matches;
    if (finePointer && !connection?.saveData) {
      if (document.readyState === 'complete') start3D();
      else window.addEventListener('load', start3D, {once: true});
    }

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
      window.removeEventListener('load', start3D);
      if (idleId !== undefined) window.cancelIdleCallback(idleId);
      if (timeoutId !== undefined) globalThis.clearTimeout(timeoutId);
      motionMedia.removeEventListener('change', handleMotionChange);
      pointerMedia.removeEventListener('change', handlePointerChange);
    };
  }, []);

  // Stop rendering the WebGL scene while the hero is scrolled out of view.
  useEffect(() => {
    const el = canvasWrapRef.current;
    if (!el || !('IntersectionObserver' in window)) return;
    const observer = new IntersectionObserver(([entry]) =>
      setInView(entry.isIntersecting),
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

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
          style={{'--hero-delay': '0.1s'} as React.CSSProperties}
          className="hero3d-reveal mb-5 text-xs font-semibold uppercase tracking-[0.4em] text-[#c9a24b]"
        >
          {eyebrow}
        </span>
        <h1
          style={{'--hero-delay': '0.2s'} as React.CSSProperties}
          className="hero3d-reveal whitespace-pre-line text-4xl font-semibold leading-[1.02] tracking-[-0.02em] sm:text-5xl sm:leading-[0.98] md:text-7xl lg:text-[5.5rem]"
        >
          {title}
        </h1>
        <p
          style={{'--hero-delay': '0.35s'} as React.CSSProperties}
          className="hero3d-reveal mt-7 max-w-md text-base leading-relaxed text-[#d8d5cc] md:text-lg"
        >
          {subtitle}
        </p>
        <a
          href={ctaHref}
          style={{'--hero-delay': '0.5s'} as React.CSSProperties}
          className="hero3d-reveal mt-11 inline-flex w-fit items-center gap-3 bg-[#f5f2ea] px-8 py-4 text-sm font-semibold uppercase tracking-[0.22em] text-[#0a0b0d] transition-colors duration-300 hover:bg-[#c9a24b]"
        >
          {ctaLabel}
          <span aria-hidden="true">&rarr;</span>
        </a>
      </div>

      <div
        ref={canvasWrapRef}
        style={{'--hero-delay': '0.25s'} as React.CSSProperties}
        className="hero3d-reveal hero3d-visual relative order-1 h-[52vh] w-full md:order-2 md:h-screen md:w-[55%]"
      >
        <div className="hero3d-canvas-glow" aria-hidden="true" />
        <img
          src={POSTER_SRC}
          alt={eyebrow}
          width={484}
          height={1100}
          {...{fetchpriority: 'high'}}
          decoding="async"
          className={`hero3d-poster${sceneReady ? ' is-hidden' : ''}`}
        />
        {canRender3D && (
          <div className={`hero3d-scene${sceneReady ? ' is-ready' : ''}`}>
            <Suspense fallback={null}>
              <HeroScene
                pointerFine={pointerFine}
                reducedMotion={reducedMotion}
                paused={!inView}
                onReady={handleSceneReady}
              />
            </Suspense>
          </div>
        )}
      </div>
    </section>
  );
}
