import {Suspense} from 'react';
import {Canvas} from '@react-three/fiber';
import {
  Bounds,
  Center,
  Environment,
  Lightformer,
  OrbitControls,
  useGLTF,
} from '@react-three/drei';

/**
 * Interactive viewer for a product's Shopify-hosted 3D model (GLB). Drag to
 * rotate; zoom/pan are off so it behaves like a product photo you can turn.
 * Lighting mirrors the hero rig (baked Lightformers, no HDRI fetch).
 */
export function ProductModelViewer({
  url,
  reducedMotion,
}: {
  url: string;
  reducedMotion: boolean;
}) {
  return (
    <Canvas
      dpr={[1, 1.5]}
      gl={{antialias: true, alpha: true}}
      camera={{position: [0, 0.4, 4], fov: 35}}
    >
      <ambientLight intensity={0.6} />
      <spotLight position={[3, 4, 4]} angle={0.4} penumbra={0.7} intensity={1.6} />
      <directionalLight position={[-4, 1.5, 2]} intensity={0.45} color="#9fc2ff" />
      <pointLight position={[-1.2, 1.6, -3]} intensity={2} color="#fff2da" />

      <Environment resolution={256} frames={1} background={false}>
        <Lightformer intensity={2.4} position={[0, 3, 2]} scale={[6, 3, 1]} />
        <Lightformer
          intensity={0.8}
          color="#ffe3b0"
          position={[-3, 1, -1]}
          rotation={[0, Math.PI / 3, 0]}
          scale={[4, 4, 1]}
        />
      </Environment>

      <Suspense fallback={null}>
        <Bounds fit clip observe margin={1.35}>
          <Center>
            <Model url={url} />
          </Center>
        </Bounds>
      </Suspense>

      <OrbitControls
        makeDefault
        enablePan={false}
        enableZoom={false}
        autoRotate={!reducedMotion}
        autoRotateSpeed={1.2}
      />
    </Canvas>
  );
}

function Model({url}: {url: string}) {
  // Draco/Meshopt decoders are disabled: they spin up WebAssembly that the
  // storefront CSP blocks (same as the hero model).
  const {scene} = useGLTF(url, false, false);
  return <primitive object={scene} />;
}
