import {useCallback, useRef} from 'react';
import {useFrame} from '@react-three/fiber';
import type {ThreeEvent} from '@react-three/fiber';
import {Float, useGLTF} from '@react-three/drei';
import * as THREE from 'three';

/**
 * Path where the real product scan will live. Drop the file here and flip
 * `USE_PLACEHOLDER` below to swap it in — the rest of the scene (lighting,
 * tilt, float, shadows) does not need to change.
 */
const MODEL_PATH = '/models/alzara-ceramic-shampoo.glb';
const USE_PLACEHOLDER = true;

// How far the bottle may tilt at the very edge of the hit zone (radians).
// Kept modest on purpose — this should read as a light touch, not a spin.
const MAX_YAW = 0.42;
const MAX_PITCH = 0.24;

// Frame-rate independent lerp bases: smaller = snappier. Following the
// cursor is quick; settling back to neutral on pointer-leave is gentler.
const ACTIVE_EASE_BASE = 0.00006;
const IDLE_EASE_BASE = 0.006;

interface ProductModelProps {
  /** True only for real mice/trackpads (`pointer: fine`) — never on touch. */
  pointerFine: boolean;
  reducedMotion: boolean;
}

export function ProductModel({pointerFine, reducedMotion}: ProductModelProps) {
  const tiltGroup = useRef<THREE.Group>(null);
  // Mutable, not state: written every pointermove, read every frame, never
  // triggers a re-render.
  const hover = useRef({x: 0, y: 0, active: false});

  const handlePointerMove = useCallback((event: ThreeEvent<PointerEvent>) => {
    if (!event.uv) return;
    hover.current.x = event.uv.x * 2 - 1;
    hover.current.y = event.uv.y * 2 - 1;
  }, []);
  const handlePointerEnter = useCallback(() => {
    hover.current.active = true;
  }, []);
  const handlePointerLeave = useCallback(() => {
    hover.current.active = false;
  }, []);

  useFrame((_, delta) => {
    if (!tiltGroup.current || reducedMotion) return;

    const h = hover.current;
    const targetY = h.active ? h.x * MAX_YAW : 0;
    const targetX = h.active ? -h.y * MAX_PITCH : 0;

    // Snap toward the cursor while hovering, settle gently once it leaves.
    const easeBase = h.active ? ACTIVE_EASE_BASE : IDLE_EASE_BASE;
    const ease = 1 - Math.pow(easeBase, delta);
    tiltGroup.current.rotation.y = THREE.MathUtils.lerp(
      tiltGroup.current.rotation.y,
      targetY,
      ease,
    );
    tiltGroup.current.rotation.x = THREE.MathUtils.lerp(
      tiltGroup.current.rotation.x,
      targetX,
      ease,
    );
  });

  return (
    <group ref={tiltGroup}>
      <Float
        speed={reducedMotion ? 0 : 1.2}
        rotationIntensity={reducedMotion ? 0 : 0.25}
        floatIntensity={reducedMotion ? 0 : 0.6}
        floatingRange={[-0.06, 0.06]}
      >
        {/* Scale lives on its own group so it never fights the tilt/float transforms above. */}
        <group scale={1.25}>
          {USE_PLACEHOLDER ? <PlaceholderBottle /> : <GLTFBottle />}
          {pointerFine && !reducedMotion && (
            <mesh
              position={[0, 0.39, 0.55]}
              onPointerMove={handlePointerMove}
              onPointerEnter={handlePointerEnter}
              onPointerLeave={handlePointerLeave}
            >
              {/* Invisible hit zone sized to the bottle's silhouette — this is
                  what makes the tilt react to the bottle itself instead of
                  the whole screen. Not visible: opacity 0, no depth write. */}
              <planeGeometry args={[1.3, 2.2]} />
              <meshBasicMaterial transparent opacity={0} depthWrite={false} />
            </mesh>
          )}
        </group>
      </Float>
    </group>
  );
}

/** Dark plastic/glass body material — lifted just enough off pure black to
 * hold volume and pick up the studio rig's specular highlights. */
const bodyMaterial = (
  <meshPhysicalMaterial
    color="#1c1f26"
    roughness={0.24}
    metalness={0.08}
    clearcoat={1}
    clearcoatRoughness={0.06}
    envMapIntensity={1.4}
  />
);

/**
 * Temporary geometric stand-in for the ALZARA Ceramic Shampoo bottle.
 * Replace by setting USE_PLACEHOLDER = false once the GLB is in place.
 */
function PlaceholderBottle() {
  return (
    <group position={[0, -0.2, 0]}>
      <mesh position={[0, 0.35, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[0.46, 0.52, 1.5, 48]} />
        {bodyMaterial}
      </mesh>
      <mesh position={[0, 1.14, 0]} castShadow>
        <cylinderGeometry args={[0.24, 0.46, 0.22, 48]} />
        {bodyMaterial}
      </mesh>
      <mesh position={[0, 1.34, 0]} castShadow>
        <cylinderGeometry args={[0.2, 0.24, 0.2, 32]} />
        {bodyMaterial}
      </mesh>
      <mesh position={[0, 1.5, 0]} castShadow>
        <cylinderGeometry args={[0.22, 0.22, 0.16, 32]} />
        <meshPhysicalMaterial
          color="#d8b264"
          roughness={0.18}
          metalness={0.9}
          clearcoat={0.6}
          clearcoatRoughness={0.15}
          envMapIntensity={1.6}
        />
      </mesh>
      <mesh position={[0, 0.35, 0.47]}>
        <planeGeometry args={[0.55, 0.4]} />
        <meshPhysicalMaterial
          color="#f5f1e8"
          roughness={0.6}
          side={THREE.DoubleSide}
        />
      </mesh>
    </group>
  );
}

/**
 * Real product model loader. Not wired in yet (see USE_PLACEHOLDER) — kept
 * here so the swap is a one-line change instead of a scene rewrite.
 */
function GLTFBottle() {
  const {scene} = useGLTF(MODEL_PATH);
  return <primitive object={scene} />;
}

// Only warm the GLTF cache once the real model exists — avoids a guaranteed
// 404 fetch for /models/alzara-ceramic-shampoo.glb while the placeholder is active.
if (!USE_PLACEHOLDER) {
  useGLTF.preload(MODEL_PATH);
}
