import {
  Suspense,
  useEffect,
  useMemo,
  useRef,
  type MutableRefObject,
} from 'react';
import {Canvas, useFrame, useThree} from '@react-three/fiber';
import {
  CameraControls,
  ContactShadows,
  Environment,
  Lightformer,
  Sparkles,
  useGLTF,
  useProgress,
} from '@react-three/drei';
import * as THREE from 'three';
import {
  applyBodyEffect,
  applyGlassEffect,
  createBodyUniforms,
  createGlassUniforms,
  type BodyUniforms,
  type GlassUniforms,
} from './surfaceEffects';
import type {StudioEffect, StudioProduct} from './studioProducts';

const CAR_PATH = '/models/alzara-car.glb';
const BOTTLE_PATH = '/models/wind-shield-pro.glb';
const CAR_LENGTH = 4.5;
const UPRIGHT = new THREE.Quaternion();
const pointing = new THREE.Quaternion();
const BOTTLE_HEIGHT = 0.55;

// Windshield sequence, in seconds: bottle flies in, sprays, swaps for the
// microfibre cloth, cloth wipes the glass, final polish glint.
const GLASS_TIMING = {
  approach: 0.8,
  spray: 1.8,
  swap: 0.7,
  wipe: 3.6,
  polish: 1.3,
};
// Up-and-down strokes the cloth makes while crossing the windshield.
const WIPE_STROKES = 5;

/** Where the scene is in its application timeline. Reported to the UI. */
export type StudioPhase = {
  status: 'idle' | 'applying' | 'done';
  step: number;
};

type Layout = {
  center: THREE.Vector3;
  size: THREE.Vector3;
  front: THREE.Vector3;
  side: THREE.Vector3;
  windshield: THREE.Vector3;
  windshieldWidth: number;
  windshieldObject: THREE.Object3D | null;
  /** Unit vector running up the slope of the windshield. */
  glassUp: THREE.Vector3;
  glassLength: number;
  /** Approximate outward normal of the windshield. */
  glassNormal: THREE.Vector3;
};

// Seconds for each part of an application.
// (The windshield has its own sequence, see GLASS_TIMING.)
const TIMING: Record<
  Exclude<StudioEffect, 'glass'>,
  {approach: number; apply: number; exit: number}
> = {
  wash: {approach: 0.9, apply: 4.4, exit: 0.8},
  coat: {approach: 0.9, apply: 3.6, exit: 0.8},
};

export function StudioScene({
  product,
  runId,
  resetId,
  rain,
  reducedMotion,
  onPhase,
}: {
  product: StudioProduct;
  runId: number;
  resetId: number;
  rain: boolean;
  reducedMotion: boolean;
  onPhase: (phase: StudioPhase) => void;
}) {
  return (
    <div className="studio-canvas">
      <Canvas
        shadows
        dpr={[1, 1.6]}
        gl={{antialias: true, powerPreference: 'high-performance'}}
        camera={{position: [7, 2.6, 6], fov: 32, near: 0.1, far: 80}}
      >
        <color attach="background" args={['#08090b']} />
        <fog attach="fog" args={['#08090b', 12, 26]} />
        <StudioLights />
        <Suspense fallback={null}>
          <StudioContent
            product={product}
            runId={runId}
            resetId={resetId}
            rain={rain}
            reducedMotion={reducedMotion}
            onPhase={onPhase}
          />
        </Suspense>
      </Canvas>
      <LoadingOverlay />
    </div>
  );
}

function LoadingOverlay() {
  const {active, progress} = useProgress();
  if (!active && progress >= 100) return null;
  return (
    <div className="studio-loading" aria-live="polite">
      <span className="studio-loading-label">Preparando el estudio</span>
      <span className="studio-loading-bar">
        <span style={{transform: `scaleX(${Math.max(progress, 4) / 100})`}} />
      </span>
    </div>
  );
}

/** Photo-studio lighting: baked softboxes for reflections, no HDRI fetch. */
function StudioLights() {
  return (
    <>
      <ambientLight intensity={0.35} />
      <directionalLight
        position={[4, 8, 3]}
        intensity={1.4}
        castShadow
        shadow-mapSize={[2048, 2048]}
      />
      <spotLight
        position={[-6, 5, -4]}
        angle={0.5}
        penumbra={0.8}
        intensity={30}
        color="#fff2da"
      />
      <Environment resolution={512} frames={1} background={false}>
        <Lightformer
          form="rect"
          intensity={3}
          position={[0, 6, 0]}
          rotation-x={Math.PI / 2}
          scale={[10, 3, 1]}
        />
        <Lightformer
          form="rect"
          intensity={1.6}
          position={[0, 4, 6]}
          scale={[12, 1.2, 1]}
        />
        <Lightformer
          form="rect"
          intensity={1.2}
          position={[-7, 2, 0]}
          rotation-y={Math.PI / 2}
          scale={[10, 2, 1]}
        />
        <Lightformer
          form="rect"
          intensity={1.2}
          position={[7, 2, 0]}
          rotation-y={-Math.PI / 2}
          scale={[10, 2, 1]}
        />
        <Lightformer
          form="ring"
          intensity={1.4}
          color="#ffd9a0"
          position={[0, 3, -8]}
          scale={4}
        />
      </Environment>
    </>
  );
}

function StudioContent({
  product,
  runId,
  resetId,
  rain,
  reducedMotion,
  onPhase,
}: {
  product: StudioProduct;
  runId: number;
  resetId: number;
  rain: boolean;
  reducedMotion: boolean;
  onPhase: (phase: StudioPhase) => void;
}) {
  const body = useMemo(createBodyUniforms, []);
  const glass = useMemo(createGlassUniforms, []);
  const otherGlass = useMemo(
    () => ({
      ...createGlassUniforms(),
      uGrime: {value: 0.35},
      uRain: glass.uRain,
      uTime: glass.uTime,
    }),
    [glass],
  );
  const car = useCar(body, glass, otherGlass);
  const controls = useRef<CameraControls>(null);
  const applicator = useRef<THREE.Group>(null);
  const spray = useRef<SprayHandle>(null);
  const cloth = useRef<THREE.Mesh>(null);
  const sparkles = useRef<THREE.Group>(null);
  const raycaster = useMemo(() => new THREE.Raycaster(), []);
  const clothTexture = useMemo(createClothTexture, []);
  const {gl, scene, camera} = useThree();

  // Warm-up: draw the bottle, cloth and sparkles for a few frames right after
  // load (hidden behind the car). Some GPUs only finish compiling a shader on
  // its first real draw, which otherwise freezes the demo for seconds.
  const warmup = useRef(4);
  useEffect(() => {
    gl.compile(scene, camera);
  }, [gl, scene, camera]);
  const lastHit = useRef({
    point: new THREE.Vector3(),
    normal: new THREE.Vector3(0, 1, 0),
  });

  const timeline = useRef({
    start: -1,
    effect: product.effect as StudioEffect,
    reported: '',
  });
  const clock = useRef(0);
  const rainTarget = useRef(0);
  rainTarget.current = rain ? 1 : 0;

  const report = (phase: StudioPhase) => {
    const key = `${phase.status}-${phase.step}`;
    if (timeline.current.reported === key) return;
    timeline.current.reported = key;
    onPhase(phase);
  };

  // Frame the part of the car the selected product works on.
  useEffect(() => {
    const c = controls.current;
    if (!c) return;
    const {center, front, side, windshield} = car.layout;
    const up = new THREE.Vector3(0, 1, 0);
    let position: THREE.Vector3;
    let target: THREE.Vector3;
    if (product.effect === 'glass') {
      target = windshield.clone();
      position = windshield
        .clone()
        .addScaledVector(front, 4.6)
        .addScaledVector(up, 2.1)
        .addScaledVector(side, 3.2);
    } else {
      target = center.clone().addScaledVector(up, 0.55);
      position = center
        .clone()
        .addScaledVector(side, 6.2)
        .addScaledVector(front, 2.4)
        .addScaledVector(up, 1.8);
    }
    c.setLookAt(
      position.x,
      position.y,
      position.z,
      target.x,
      target.y,
      target.z,
      !reducedMotion,
    );
  }, [product.effect, car.layout, reducedMotion, resetId]);

  // Start an application.
  useEffect(() => {
    if (runId === 0) return;
    timeline.current.start = clock.current;
    timeline.current.effect = product.effect;
    timeline.current.reported = '';
    // Re-applying the same product replays it from a dirty surface.
    if (product.effect === 'glass') {
      glass.uClean.value = -0.2;
      glass.uTreated.value = -0.2;
      glass.uWet.value = -0.2;
      glass.uShine.value = -0.2;
      // Move in close so the spray and the cloth read clearly.
      const {windshield, glassNormal, side} = car.layout;
      const eye = windshield
        .clone()
        .addScaledVector(glassNormal, 3.3)
        .addScaledVector(side, 0.9);
      controls.current?.setLookAt(
        eye.x,
        eye.y,
        eye.z,
        windshield.x,
        windshield.y,
        windshield.z,
        !reducedMotion,
      );
    } else if (product.effect === 'wash') {
      body.uFoam.value = -0.2;
      body.uWash.value = -0.2;
    } else {
      body.uGloss.value = -0.2;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runId]);

  // Put everything back to a dirty, untreated car.
  useEffect(() => {
    timeline.current.start = -1;
    timeline.current.reported = '';
    body.uDirt.value = 1;
    body.uFoam.value = -0.2;
    body.uWash.value = -0.2;
    body.uGloss.value = -0.2;
    glass.uGrime.value = 1;
    glass.uClean.value = -0.2;
    glass.uTreated.value = -0.2;
    glass.uWet.value = -0.2;
    glass.uShine.value = -0.2;
    if (sparkles.current) sparkles.current.visible = false;
    report({status: 'idle', step: 0});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetId]);

  /** Windshield: spray → microfibre wipe → polish. */
  const runGlassSequence = (t: number, now: number, bottle: THREE.Group) => {
    const k = reducedMotion ? 0.6 : 1;
    const T = {
      approach: GLASS_TIMING.approach * k,
      spray: GLASS_TIMING.spray * k,
      swap: GLASS_TIMING.swap * k,
      wipe: GLASS_TIMING.wipe * k,
      polish: GLASS_TIMING.polish * k,
    };
    const sprayEnd = T.approach + T.spray;
    const wipeStart = sprayEnd + T.swap;
    const wipeEnd = wipeStart + T.wipe;
    const end = wipeEnd + T.polish;
    const layout = car.layout;

    // 1. Bottle flies in and sprays across the glass.
    const ps = THREE.MathUtils.clamp((t - T.approach) / T.spray, 0, 1);
    glass.uWet.value = sweep(ps);
    const path = getApplicatorPath('glass', layout);
    const inT = easeOutCubic(THREE.MathUtils.clamp(t / T.approach, 0, 1));
    const outT = easeInCubic(
      THREE.MathUtils.clamp((t - sprayEnd) / T.swap, 0, 1),
    );
    const along = path.start.clone().lerp(path.end, ps);
    const pos = path.enter.clone().lerp(along, inT).lerp(path.leave, outT);
    const aim = path.aim
      .clone()
      .add(new THREE.Vector3().subVectors(along, path.start));
    bottle.visible = outT < 1;
    bottle.position.copy(pos);
    bottle.quaternion.identity();
    bottle.lookAt(aim);
    bottle.rotateX(Math.PI / 2);
    pointing.copy(bottle.quaternion);
    bottle.quaternion.slerpQuaternions(UPRIGHT, pointing, 0.6);
    const nozzle = new THREE.Vector3(0, BOTTLE_HEIGHT * 0.95, 0)
      .applyQuaternion(bottle.quaternion)
      .add(pos);
    spray.current?.setActive(t > T.approach && t < sprayEnd);
    spray.current?.setEmitter(nozzle, aim);

    // 2. Microfibre cloth wipes in up/down strokes, cleaning where it passes.
    const pw = THREE.MathUtils.clamp((t - wipeStart) / T.wipe, 0, 1);
    glass.uClean.value = sweep(pw);
    glass.uTreated.value = sweep(pw - 0.03);
    const clothMesh = cloth.current;
    if (clothMesh) {
      const across = THREE.MathUtils.clamp(sweep(pw), 0.04, 0.96);
      const stroke = 0.5 - 0.4 * Math.cos(pw * Math.PI * 2 * WIPE_STROKES);
      const target = glassPoint(layout, glass, across, stroke);
      const hit = snapToGlass(raycaster, layout, target, lastHit.current);
      // Enter from above the glass during the swap, leave during the polish.
      const enter = THREE.MathUtils.clamp((t - sprayEnd) / T.swap, 0, 1);
      const leave = THREE.MathUtils.clamp(
        (t - wipeEnd) / (T.polish * 0.5),
        0,
        1,
      );
      const lift = (1 - easeOutCubic(enter)) * 1.2 + easeInCubic(leave) * 1.2;
      clothMesh.visible = t > sprayEnd && leave < 1;
      clothMesh.position
        .copy(hit.point)
        .addScaledVector(hit.normal, 0.012 + lift);
      clothMesh.quaternion.setFromUnitVectors(Z_AXIS, hit.normal);
      clothMesh.rotateZ(Math.sin(now * 9) * 0.12);
      wobbleCloth(clothMesh, now, t > wipeStart && t < wipeEnd);
    }

    // 3. Polish glint + sparkles on the spotless glass.
    glass.uShine.value = THREE.MathUtils.lerp(
      -0.15,
      1.25,
      THREE.MathUtils.clamp((t - wipeEnd) / T.polish, 0, 1),
    );
    if (sparkles.current) {
      sparkles.current.visible = t > wipeEnd - 0.2 && t < end + 2.5;
    }

    const step = t < sprayEnd ? 0 : t < wipeEnd ? 1 : 2;
    if (t < end) {
      report({status: 'applying', step});
    } else {
      timeline.current.start = -1;
      bottle.visible = false;
      if (clothMesh) clothMesh.visible = false;
      report({status: 'done', step: 2});
      // Let the sparkles linger a moment on the clean glass.
      window.setTimeout(() => {
        if (sparkles.current && timeline.current.start < 0) {
          sparkles.current.visible = false;
        }
      }, 2500);
    }
  };

  useFrame((_, delta) => {
    if (warmup.current > 0) {
      warmup.current--;
      const spot = car.layout.center;
      for (const object of [
        applicator.current,
        cloth.current,
        sparkles.current,
      ]) {
        if (!object) continue;
        object.visible = warmup.current > 0;
        object.position.copy(spot);
      }
      spray.current?.setEmitter(spot, spot);
      spray.current?.setActive(warmup.current > 0);
      if (warmup.current > 0) return;
      if (sparkles.current) {
        sparkles.current.position
          .copy(car.layout.windshield)
          .addScaledVector(car.layout.glassNormal, 0.08);
      }
    }
    clock.current += delta;
    const now = clock.current;
    body.uTime.value = now;
    glass.uTime.value = now;
    glass.uRain.value = THREE.MathUtils.damp(
      glass.uRain.value,
      rainTarget.current,
      1.8,
      delta,
    );

    const bottle = applicator.current;
    const tl = timeline.current;
    if (tl.start < 0 || !bottle) {
      if (bottle) bottle.visible = false;
      if (cloth.current) cloth.current.visible = false;
      spray.current?.setActive(false);
      return;
    }

    if (tl.effect === 'glass') {
      runGlassSequence(now - tl.start, now, bottle);
      return;
    }

    const bodyEffect = tl.effect as Exclude<StudioEffect, 'glass'>;
    const timing = TIMING[bodyEffect];
    const scale = reducedMotion ? 0.6 : 1;
    const approach = timing.approach * scale;
    const apply = timing.apply * scale;
    const exit = timing.exit * scale;
    const t = now - tl.start;
    const p = THREE.MathUtils.clamp((t - approach) / apply, 0, 1);

    // Surface progress + UI step.
    let step = 0;
    if (tl.effect === 'wash') {
      body.uFoam.value = sweep(p / 0.4);
      body.uWash.value = sweep((p - 0.55) / 0.45);
      step = p < 0.4 ? 0 : p < 0.55 ? 1 : 2;
    } else {
      body.uGloss.value = sweep(p);
      step = p < 0.55 ? 0 : p < 0.9 ? 1 : 2;
    }

    // Applicator path: fly in, follow the sweep, fly out.
    const path = getApplicatorPath(tl.effect, car.layout);
    const inT = easeOutCubic(THREE.MathUtils.clamp(t / approach, 0, 1));
    const outT = easeInCubic(
      THREE.MathUtils.clamp((t - approach - apply) / exit, 0, 1),
    );
    const along = path.start
      .clone()
      .lerp(path.end, tl.effect === 'wash' ? washTravel(p) : p);
    const pos = path.enter.clone().lerp(along, inT).lerp(path.leave, outT);
    const aim = path.aim
      .clone()
      .add(new THREE.Vector3().subVectors(along, path.start));
    bottle.visible = outT < 1;
    bottle.position.copy(pos);
    // Tilt the bottle ~60% of the way from upright towards the surface.
    bottle.quaternion.identity();
    bottle.lookAt(aim);
    bottle.rotateX(Math.PI / 2);
    pointing.copy(bottle.quaternion);
    bottle.quaternion.slerpQuaternions(UPRIGHT, pointing, 0.6);
    bottle.rotateY(Math.sin(now * 2.2) * 0.08);

    const nozzle = new THREE.Vector3(0, BOTTLE_HEIGHT * 0.95, 0)
      .applyQuaternion(bottle.quaternion)
      .add(pos);
    const spraying =
      t > approach &&
      t < approach + apply &&
      (tl.effect !== 'wash' || p < 0.4 || p > 0.55);
    spray.current?.setActive(spraying);
    spray.current?.setEmitter(nozzle, aim);

    if (t < approach + apply + exit) {
      report({status: 'applying', step});
    } else {
      tl.start = -1;
      bottle.visible = false;
      report({status: 'done', step: 2});
    }
  });

  return (
    <>
      <primitive object={car.scene} />
      <mesh rotation-x={-Math.PI / 2} position-y={0} receiveShadow>
        <circleGeometry args={[14, 96]} />
        <meshStandardMaterial
          color="#0c0d10"
          roughness={0.55}
          metalness={0.25}
        />
      </mesh>
      <ContactShadows
        position={[0, 0.005, 0]}
        opacity={0.75}
        scale={12}
        blur={2.4}
        far={3}
        frames={1}
      />
      <group ref={applicator} visible={false}>
        <ApplicatorBottle product={product} />
      </group>
      <Spray handle={spray} color={product.tone} kind={product.effect} />
      <mesh ref={cloth} visible={false} castShadow>
        <planeGeometry args={[0.5, 0.36, 14, 10]} />
        <meshStandardMaterial
          map={clothTexture}
          roughness={1}
          side={THREE.DoubleSide}
        />
      </mesh>
      <group
        ref={sparkles}
        visible={false}
        position={car.layout.windshield
          .clone()
          .addScaledVector(car.layout.glassNormal, 0.08)
          .toArray()}
      >
        <Sparkles
          count={70}
          scale={[car.layout.windshieldWidth, 0.9, 0.9]}
          size={4}
          speed={0.5}
          color="#ffffff"
          opacity={0.9}
        />
      </group>
      <Rain amount={glass.uRain} />
      <CameraControls
        ref={controls}
        makeDefault
        minDistance={3}
        maxDistance={13}
        maxPolarAngle={Math.PI * 0.47}
        smoothTime={0.6}
      />
    </>
  );
}

/** Sweep uniform goes a bit past both ends so the ragged edge fully clears. */
function sweep(p: number) {
  return THREE.MathUtils.lerp(-0.15, 1.15, THREE.MathUtils.clamp(p, 0, 1));
}

/** For the wash the bottle passes once for foam, waits, then again to rinse. */
function washTravel(p: number) {
  if (p < 0.4) return p / 0.4;
  if (p < 0.55) return 1;
  return 1 - (p - 0.55) / 0.45;
}

function easeOutCubic(x: number) {
  return 1 - Math.pow(1 - x, 3);
}

function easeInCubic(x: number) {
  return x * x * x;
}

function getApplicatorPath(effect: StudioEffect, layout: Layout) {
  const up = new THREE.Vector3(0, 1, 0);
  const {center, size, front, side, windshield, windshieldWidth} = layout;
  if (effect === 'glass') {
    const hover = windshield
      .clone()
      .addScaledVector(front, 0.75)
      .addScaledVector(up, 0.55);
    const start = hover.clone().addScaledVector(side, windshieldWidth * 0.45);
    const end = hover.clone().addScaledVector(side, -windshieldWidth * 0.45);
    return {
      start,
      end,
      aim: windshield.clone().addScaledVector(side, windshieldWidth * 0.45),
      enter: start.clone().addScaledVector(up, 1.6).addScaledVector(front, 1.2),
      leave: end.clone().addScaledVector(up, 1.6).addScaledVector(front, 1.2),
    };
  }
  const length = Math.max(size.x, size.z);
  const width = Math.min(size.x, size.z);
  const sideLine = center
    .clone()
    .addScaledVector(side, width / 2 + 0.75)
    .addScaledVector(up, size.y * 0.75);
  const start = sideLine.clone().addScaledVector(front, length * 0.45);
  const end = sideLine.clone().addScaledVector(front, -length * 0.45);
  return {
    start,
    end,
    aim: center
      .clone()
      .addScaledVector(side, width * 0.3)
      .addScaledVector(up, size.y * 0.45)
      .addScaledVector(front, length * 0.45),
    enter: start.clone().addScaledVector(up, 1.8).addScaledVector(side, 1),
    leave: end.clone().addScaledVector(up, 1.8).addScaledVector(side, 1),
  };
}

/** Loads the car once, normalises its size and wires the dirt effects in. */
function useCar(
  body: BodyUniforms,
  glass: GlassUniforms,
  otherGlass: GlassUniforms,
) {
  const gltf = useGLTF(CAR_PATH, false, false);

  return useMemo(() => {
    const scene = gltf.scene;
    scene.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      object.castShadow = true;
      object.receiveShadow = true;
      const material = object.material as THREE.Material;
      if (object.name === 'BodyWindshield') {
        const windshieldMaterial = material.clone();
        applyGlassEffect(windshieldMaterial, glass);
        object.material = windshieldMaterial;
      } else if (material.name === 'Glass') {
        applyGlassEffect(material, otherGlass);
      } else if (/^(Paint|Panel|Rim)/.test(material.name)) {
        // Re-bind on every run: the GLTF is cached, so this material may
        // still hold uniforms from a previous mount (or StrictMode's
        // discarded first render).
        applyBodyEffect(material, body);
      }
    });

    // Normalise: fixed length, centred, wheels on the floor.
    scene.position.set(0, 0, 0);
    scene.scale.setScalar(1);
    scene.updateMatrixWorld(true);
    let box = new THREE.Box3().setFromObject(scene);
    const rawSize = box.getSize(new THREE.Vector3());
    scene.scale.setScalar(CAR_LENGTH / Math.max(rawSize.x, rawSize.z));
    scene.updateMatrixWorld(true);
    box = new THREE.Box3().setFromObject(scene);
    const rawCenter = box.getCenter(new THREE.Vector3());
    scene.position.set(-rawCenter.x, -box.min.y, -rawCenter.z);
    scene.updateMatrixWorld(true);
    box = new THREE.Box3().setFromObject(scene);

    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const longAxis =
      size.x > size.z ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 0, 1);

    const windshieldMesh = scene.getObjectByName('BodyWindshield');
    const windshieldBox = windshieldMesh
      ? new THREE.Box3().setFromObject(windshieldMesh)
      : box.clone();
    const windshield = windshieldBox.getCenter(new THREE.Vector3());
    const frontSign =
      Math.sign(windshield.clone().sub(center).dot(longAxis)) || 1;
    const front = longAxis.clone().multiplyScalar(frontSign);
    const side = new THREE.Vector3()
      .crossVectors(new THREE.Vector3(0, 1, 0), front)
      .normalize();

    // Body sweep runs front → back; glass sweep runs across the windshield.
    body.uAxis.value.copy(front).negate();
    body.uRange.value.copy(projectRange(box, body.uAxis.value));
    body.uFloor.value.set(box.min.y, box.max.y);
    glass.uAxis.value.copy(side).negate();
    glass.uRange.value.copy(projectRange(windshieldBox, glass.uAxis.value));
    otherGlass.uAxis.value.copy(glass.uAxis.value);
    otherGlass.uRange.value.copy(glass.uRange.value);

    const windshieldSize = windshieldBox.getSize(new THREE.Vector3());
    // The windshield slopes up and back: rise = its height, run = its depth.
    const up = new THREE.Vector3(0, 1, 0);
    const rise = windshieldSize.y;
    const run = Math.abs(windshieldSize.dot(front));
    const glassUp = up
      .clone()
      .multiplyScalar(rise)
      .addScaledVector(front, -run)
      .normalize();
    const glassNormal = front
      .clone()
      .multiplyScalar(rise)
      .addScaledVector(up, run)
      .normalize();
    const layout: Layout = {
      center,
      size,
      front,
      side,
      windshield,
      windshieldWidth: Math.abs(windshieldSize.dot(side)) || size.x * 0.8,
      windshieldObject: windshieldMesh ?? null,
      glassUp,
      glassLength: Math.hypot(rise, run),
      glassNormal,
    };
    glass.uUp.value.copy(up);
    return {scene, layout};
  }, [gltf, body, glass, otherGlass]);
}

const Z_AXIS = new THREE.Vector3(0, 0, 1);

/**
 * A point on the windshield: `across` 0→1 follows the cleaning sweep axis,
 * `height` 0→1 runs from the bottom edge to the top of the glass.
 */
function glassPoint(
  layout: Layout,
  glass: GlassUniforms,
  across: number,
  height: number,
) {
  const axis = glass.uAxis.value;
  const [min, max] = [glass.uRange.value.x, glass.uRange.value.y];
  const d = THREE.MathUtils.lerp(min + 0.12, max - 0.12, across);
  return layout.windshield
    .clone()
    .addScaledVector(axis, d - layout.windshield.dot(axis))
    .addScaledVector(layout.glassUp, (height - 0.5) * layout.glassLength * 0.7);
}

/** Projects a point onto the real curved windshield surface. */
function snapToGlass(
  raycaster: THREE.Raycaster,
  layout: Layout,
  target: THREE.Vector3,
  last: {point: THREE.Vector3; normal: THREE.Vector3},
) {
  if (!layout.windshieldObject) {
    last.point.copy(target);
    last.normal.copy(layout.glassNormal);
    return last;
  }
  const origin = target.clone().addScaledVector(layout.glassNormal, 1.5);
  raycaster.set(origin, layout.glassNormal.clone().negate());
  const hit = raycaster.intersectObject(layout.windshieldObject, true)[0];
  if (hit) {
    last.point.copy(hit.point);
    if (hit.face) {
      last.normal
        .copy(hit.face.normal)
        .transformDirection(hit.object.matrixWorld);
      if (last.normal.dot(layout.glassNormal) < 0) last.normal.negate();
    } else {
      last.normal.copy(layout.glassNormal);
    }
  }
  return last;
}

/** Gold microfibre: fine fibre noise, darker stitched hem, AutoCare Express tag. */
function createClothTexture() {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#d2a64c';
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 9000; i++) {
    const shade = Math.random() > 0.5 ? 255 : 0;
    ctx.fillStyle = `rgba(${shade},${shade * 0.85},${shade * 0.5},${Math.random() * 0.08})`;
    ctx.fillRect(Math.random() * size, Math.random() * size, 1.5, 1.5);
  }
  ctx.strokeStyle = '#9c7428';
  ctx.lineWidth = 10;
  ctx.strokeRect(5, 5, size - 10, size - 10);
  ctx.setLineDash([5, 4]);
  ctx.strokeStyle = 'rgba(255, 236, 190, 0.7)';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(14, 14, size - 28, size - 28);
  ctx.fillStyle = '#0b0c0f';
  ctx.fillRect(size - 92, size - 40, 70, 20);
  ctx.fillStyle = '#e8cf8f';
  ctx.font = 'bold 11px Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('AUTOCARE', size - 57, size - 26);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/** Soft folds that ripple while the cloth scrubs. */
function wobbleCloth(mesh: THREE.Mesh, time: number, scrubbing: boolean) {
  const position = mesh.geometry.attributes.position as THREE.BufferAttribute;
  const amount = scrubbing ? 0.014 : 0.006;
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i);
    const y = position.getY(i);
    const edge = Math.abs(x) / 0.25 + Math.abs(y) / 0.18;
    position.setZ(
      i,
      Math.sin(x * 22 + time * 7) * amount * edge +
        Math.max(0, edge - 1.2) * 0.02,
    );
  }
  position.needsUpdate = true;
  mesh.geometry.computeVertexNormals();
}

function projectRange(box: THREE.Box3, axis: THREE.Vector3) {
  let min = Infinity;
  let max = -Infinity;
  for (const x of [box.min.x, box.max.x]) {
    for (const y of [box.min.y, box.max.y]) {
      for (const z of [box.min.z, box.max.z]) {
        const d = axis.dot(new THREE.Vector3(x, y, z));
        min = Math.min(min, d);
        max = Math.max(max, d);
      }
    }
  }
  return new THREE.Vector2(min, max);
}

/** The real Wind Shield PRO scan; other products get a branded stand-in bottle. */
function ApplicatorBottle({product}: {product: StudioProduct}) {
  if (product.id === 'wind-shield-pro') return <ScannedBottle />;
  return (
    <group>
      <mesh position-y={BOTTLE_HEIGHT * 0.4} castShadow>
        <cylinderGeometry args={[0.075, 0.08, BOTTLE_HEIGHT * 0.8, 32]} />
        <meshPhysicalMaterial color="#15171c" roughness={0.25} clearcoat={1} />
      </mesh>
      <mesh position-y={BOTTLE_HEIGHT * 0.4}>
        <cylinderGeometry
          args={[0.0765, 0.0815, BOTTLE_HEIGHT * 0.3, 32, 1, true]}
        />
        <meshStandardMaterial
          color={product.tone}
          roughness={0.4}
          metalness={0.3}
        />
      </mesh>
      <mesh position-y={BOTTLE_HEIGHT * 0.88}>
        <cylinderGeometry args={[0.035, 0.045, BOTTLE_HEIGHT * 0.16, 24]} />
        <meshStandardMaterial color={product.tone} roughness={0.35} />
      </mesh>
    </group>
  );
}

function ScannedBottle() {
  const {scene} = useGLTF(BOTTLE_PATH, false, false);
  const bottle = useMemo(() => {
    const clone = scene.clone(true);
    const box = new THREE.Box3().setFromObject(clone);
    const size = box.getSize(new THREE.Vector3());
    clone.scale.setScalar(BOTTLE_HEIGHT / size.y);
    const scaled = new THREE.Box3().setFromObject(clone);
    const center = scaled.getCenter(new THREE.Vector3());
    clone.position.set(-center.x, -scaled.min.y, -center.z);
    clone.traverse((o) => {
      if (o instanceof THREE.Mesh) o.castShadow = true;
    });
    return clone;
  }, [scene]);
  return <primitive object={bottle} />;
}

type SprayHandle = {
  setActive: (active: boolean) => void;
  setEmitter: (from: THREE.Vector3, to: THREE.Vector3) => void;
};

const SPRAY_COUNT = 420;

/** Mist / foam / coating droplets travelling from the nozzle to the surface. */
function Spray({
  handle,
  color,
  kind,
}: {
  handle: MutableRefObject<SprayHandle | null>;
  color: string;
  kind: StudioEffect;
}) {
  const points = useRef<THREE.Points>(null);
  const state = useRef({
    active: false,
    from: new THREE.Vector3(),
    to: new THREE.Vector3(),
  });
  const particles = useMemo(() => {
    const age = new Float32Array(SPRAY_COUNT).fill(1);
    const start = new Float32Array(SPRAY_COUNT * 3);
    const end = new Float32Array(SPRAY_COUNT * 3);
    const positions = new Float32Array(SPRAY_COUNT * 3).fill(9999);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    return {age, start, end, positions, geometry};
  }, []);

  handle.current = {
    setActive: (active) => {
      state.current.active = active;
    },
    setEmitter: (from, to) => {
      state.current.from.copy(from);
      state.current.to.copy(to);
    },
  };

  useFrame((_, delta) => {
    const {age, start, end, positions, geometry} = particles;
    const {active, from, to} = state.current;
    const lifetime = kind === 'wash' ? 0.7 : 0.45;
    let spawn = active ? Math.ceil(SPRAY_COUNT * (delta / lifetime)) : 0;
    const spread = kind === 'wash' ? 0.35 : 0.22;
    for (let i = 0; i < SPRAY_COUNT; i++) {
      if (age[i] >= 1 && spawn > 0) {
        spawn--;
        age[i] = Math.random() * 0.1;
        start[i * 3] = from.x;
        start[i * 3 + 1] = from.y;
        start[i * 3 + 2] = from.z;
        end[i * 3] = to.x + (Math.random() - 0.5) * spread * 2;
        end[i * 3 + 1] = to.y + (Math.random() - 0.5) * spread;
        end[i * 3 + 2] = to.z + (Math.random() - 0.5) * spread * 2;
      }
      if (age[i] < 1) {
        age[i] += delta / lifetime;
        const k = Math.min(age[i], 1);
        const e = 1 - Math.pow(1 - k, 2);
        positions[i * 3] = start[i * 3] + (end[i * 3] - start[i * 3]) * e;
        positions[i * 3 + 1] =
          start[i * 3 + 1] + (end[i * 3 + 1] - start[i * 3 + 1]) * e;
        positions[i * 3 + 2] =
          start[i * 3 + 2] + (end[i * 3 + 2] - start[i * 3 + 2]) * e;
      } else {
        positions[i * 3 + 1] = 9999;
      }
    }
    geometry.attributes.position.needsUpdate = true;
  });

  return (
    <points ref={points} geometry={particles.geometry} frustumCulled={false}>
      <pointsMaterial
        color={color}
        size={kind === 'wash' ? 0.06 : 0.028}
        transparent
        opacity={kind === 'wash' ? 0.85 : 0.7}
        depthWrite={false}
        sizeAttenuation
      />
    </points>
  );
}

const RAIN_COUNT = 1400;

/** Falling rain streaks around the car, faded in/out with `amount`. */
function Rain({amount}: {amount: {value: number}}) {
  const lines = useRef<THREE.LineSegments>(null);
  const material = useRef<THREE.LineBasicMaterial>(null);
  const data = useMemo(() => {
    const positions = new Float32Array(RAIN_COUNT * 6);
    const speed = new Float32Array(RAIN_COUNT);
    for (let i = 0; i < RAIN_COUNT; i++) {
      const x = (Math.random() - 0.5) * 12;
      const y = Math.random() * 7;
      const z = (Math.random() - 0.5) * 12;
      positions.set([x, y, z, x - 0.02, y - 0.22, z], i * 6);
      speed[i] = 8 + Math.random() * 4;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    return {positions, speed, geometry};
  }, []);

  useFrame((_, delta) => {
    const visible = amount.value > 0.01;
    if (lines.current) lines.current.visible = visible;
    if (material.current) material.current.opacity = 0.32 * amount.value;
    if (!visible) return;
    const {positions, speed, geometry} = data;
    for (let i = 0; i < RAIN_COUNT; i++) {
      const dy = speed[i] * delta;
      positions[i * 6 + 1] -= dy;
      positions[i * 6 + 4] -= dy;
      if (positions[i * 6 + 4] < 0) {
        const y = 6 + Math.random() * 1.5;
        positions[i * 6 + 1] = y;
        positions[i * 6 + 4] = y - 0.22;
      }
    }
    geometry.attributes.position.needsUpdate = true;
  });

  return (
    <lineSegments ref={lines} geometry={data.geometry} frustumCulled={false}>
      <lineBasicMaterial
        ref={material}
        color="#a9c4e0"
        transparent
        opacity={0}
        depthWrite={false}
      />
    </lineSegments>
  );
}

useGLTF.preload(CAR_PATH, false, false);
