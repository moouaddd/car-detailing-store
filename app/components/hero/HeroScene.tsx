import {Suspense, useEffect} from 'react';
import {Canvas, useThree} from '@react-three/fiber';
import {ContactShadows, Environment, Lightformer} from '@react-three/drei';
import {ProductModel} from './ProductModel';

interface HeroSceneProps {
  /** True only for real mice/trackpads (`pointer: fine`) — never on touch. */
  pointerFine: boolean;
  reducedMotion: boolean;
  /** Pause rendering entirely (hero scrolled out of view). */
  paused?: boolean;
  /** Fires once the bottle has loaded and been drawn. */
  onReady?: () => void;
}

/**
 * Isolated R3F canvas for the hero. Lighting/reflections are entirely
 * hand-placed (direct lights + a baked Lightformer studio rig) so nothing
 * fetches an external HDRI — self-contained and fast, still gives the
 * bottle believable specular highlights like a product photo softbox.
 */
export function HeroScene({
  pointerFine,
  reducedMotion,
  paused = false,
  onReady,
}: HeroSceneProps) {
  return (
    <Canvas
      frameloop={paused ? 'never' : 'always'}
      shadows
      dpr={[1, 1.5]}
      gl={{antialias: true, alpha: true, powerPreference: 'high-performance'}}
      camera={{position: [0, 0.5, 5.2], rotation: [0, 0, 0], fov: 31}}
    >
      {/* Soft base fill so the dark plastic never reads as a pure silhouette */}
      <ambientLight intensity={0.55} />

      {/* Key light — the main modelling light, camera-left/above */}
      <spotLight
        position={[3, 4, 4]}
        angle={0.4}
        penumbra={0.7}
        intensity={1.6}
        castShadow
        shadow-mapSize={[1024, 1024]}
      />

      {/* Cool fill from the opposite side, keeps shadows from going flat black */}
      <directionalLight
        position={[-4, 1.5, 2]}
        intensity={0.45}
        color="#9fc2ff"
      />

      {/* Rim/back light — separates the bottle silhouette from the dark backdrop */}
      <pointLight position={[-1.2, 1.6, -3]} intensity={2.2} color="#fff2da" />
      <pointLight position={[1.6, -0.6, -2.4]} intensity={1} color="#c9a24b" />

      {/* Baked studio softbox rig for elegant specular reflections, no HDRI fetch.
          frames=1 bakes it once instead of re-rendering every frame. */}
      <Environment resolution={256} frames={1} background={false}>
        <Lightformer
          intensity={2.4}
          color="#ffffff"
          position={[0, 3, 2]}
          scale={[6, 3, 1]}
        />
        <Lightformer
          intensity={0.8}
          color="#ffe3b0"
          position={[-3, 1, -1]}
          rotation={[0, Math.PI / 3, 0]}
          scale={[4, 4, 1]}
        />
        <Lightformer
          intensity={1.1}
          color="#9fc2ff"
          position={[3, -1, -1]}
          rotation={[0, -Math.PI / 3, 0]}
          scale={[4, 4, 1]}
        />
      </Environment>

      <Suspense fallback={null}>
        <ProductModel pointerFine={pointerFine} reducedMotion={reducedMotion} />
        {onReady && <ReadySignal onReady={onReady} />}
        <ContactShadows
          position={[0, -0.53, 0]}
          opacity={0.6}
          scale={6}
          blur={2.6}
          far={2}
        />
      </Suspense>
    </Canvas>
  );
}

/**
 * Mounted inside the model's Suspense boundary, so it only runs once the GLB
 * has loaded; waits for a real frame before swapping out the poster image.
 */
function ReadySignal({onReady}: {onReady: () => void}) {
  const invalidate = useThree((state) => state.invalidate);
  useEffect(() => {
    invalidate();
    const id = requestAnimationFrame(() =>
      requestAnimationFrame(() => onReady()),
    );
    return () => cancelAnimationFrame(id);
  }, [invalidate, onReady]);
  return null;
}
