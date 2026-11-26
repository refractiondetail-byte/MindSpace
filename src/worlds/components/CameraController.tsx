import { useEffect, useMemo, useRef, type ElementRef } from 'react';
import { OrbitControls } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { CameraView, Vec3 } from '../layout';

export interface CameraFocus {
  /** `null` requests the home view. */
  position: Vec3 | null;
  /** Changes on every request so re-selecting the same node flies again. */
  token: number;
  /**
   * Optional moving object to fly to. The flight homes in on its live
   * position, and the camera keeps riding along with it afterwards.
   */
  follow?: THREE.Object3D | null;
  /** Overrides `view.focusDistance` for this focus. */
  distance?: number;
}

interface Flight {
  fromTarget: THREE.Vector3;
  toTarget: THREE.Vector3;
  follow: THREE.Object3D | null;
  fromDirection: THREE.Vector3;
  toDirection: THREE.Vector3;
  logFromDistance: number;
  logToDistance: number;
  /** Extra pull-back (in log-distance) at mid-flight when hopping sideways. */
  hump: number;
  fovKick: number;
  elapsed: number;
  duration: number;
  lastLogDistance: number;
}

interface CameraControllerProps {
  focus: CameraFocus | null;
  /** Home/target are world-specific so each skin gets its own framing. */
  view: CameraView;
  /** Draw light streaks rushing past during long flights. */
  warp?: boolean;
}

/** Live flight signal shared with the warp streak effect. */
interface WarpSignal {
  /** 0..1 strength of the streaks. */
  intensity: number;
  /** +1 when diving in, -1 when pulling out. */
  direction: number;
}

function smootherstep(x: number): number {
  const t = Math.min(1, Math.max(0, x));
  return t * t * t * (t * (t * 6 - 15) + 10);
}

const scratchQuat = new THREE.Quaternion();
const identityQuat = new THREE.Quaternion();
const scratchVec = new THREE.Vector3();

/** Spherical interpolation between two unit vectors. */
function slerpDirection(from: THREE.Vector3, to: THREE.Vector3, t: number, out: THREE.Vector3) {
  scratchQuat.setFromUnitVectors(from, to);
  identityQuat.identity().slerp(scratchQuat, t);
  return out.copy(from).applyQuaternion(identityQuat).normalize();
}

/**
 * OrbitControls plus a cinematic fly-to: the camera swings toward the
 * destination, then dives in at a constant *perceived* speed (distance is
 * interpolated in log space), with a brief field-of-view kick and light
 * streaks, so a jump from the whole galaxy to a single planet feels like
 * plunging through the stars.
 */
export function CameraController({ focus, view, warp = false }: CameraControllerProps) {
  const controlsRef = useRef<ElementRef<typeof OrbitControls>>(null);
  const camera = useThree((state) => state.camera) as THREE.PerspectiveCamera;
  const flight = useRef<Flight | null>(null);
  const following = useRef<{ object: THREE.Object3D; last: THREE.Vector3 } | null>(null);
  const baseFov = useRef(camera.fov);
  const warpSignal = useRef<WarpSignal>({ intensity: 0, direction: 1 });

  // A theme change is a full re-skin: frame the new world immediately.
  useEffect(() => {
    const controls = controlsRef.current;
    if (!controls) return;
    flight.current = null;
    following.current = null;
    controls.enabled = true;
    camera.position.set(...view.home);
    controls.target.set(...view.target);
    controls.update();
  }, [view, camera]);

  useEffect(() => {
    const controls = controlsRef.current;
    if (!controls || !focus) return;

    const fromTarget = controls.target.clone();
    const fromOffset = new THREE.Vector3().subVectors(camera.position, fromTarget);
    const fromDistance = Math.max(fromOffset.length(), 0.01);
    const fromDirection = fromOffset.lengthSq() > 1e-6 ? fromOffset.normalize() : new THREE.Vector3(0, 0.5, 1).normalize();

    let toTarget: THREE.Vector3;
    let toDirection: THREE.Vector3;
    let toDistance: number;
    let follow: THREE.Object3D | null = null;

    if (focus.position || focus.follow) {
      follow = focus.follow ?? null;
      toTarget = follow
        ? follow.getWorldPosition(new THREE.Vector3())
        : new THREE.Vector3(...(focus.position as Vec3));
      toDistance = focus.distance ?? view.focusDistance;

      // Arrive from a gently raised angle, swung a little around the target
      // so the approach curves instead of being a straight dolly.
      const horizontal = new THREE.Vector3(fromDirection.x, 0, fromDirection.z);
      if (horizontal.lengthSq() < 1e-4) horizontal.set(0, 0, 1);
      horizontal.normalize().applyAxisAngle(new THREE.Vector3(0, 1, 0), 0.55);
      toDirection = horizontal.multiplyScalar(0.9).add(new THREE.Vector3(0, 0.42, 0)).normalize();
    } else {
      toTarget = new THREE.Vector3(...view.target);
      const homeOffset = new THREE.Vector3(...view.home).sub(toTarget);
      toDistance = homeOffset.length();
      toDirection = homeOffset.normalize();
    }

    const zoomRatio = Math.abs(Math.log(fromDistance / toDistance));
    const sideways = fromTarget.distanceTo(toTarget);
    const span = sideways / Math.max(Math.min(fromDistance, toDistance), 0.01);
    // Pull back mid-flight when hopping between nearby-but-separate targets.
    const hump = focus.position || focus.follow ? Math.max(0, Math.log(1 + span * 0.8) - zoomRatio * 0.5) : 0;
    const duration = THREE.MathUtils.clamp(
      1.2 + zoomRatio * 0.45 + hump * 0.35,
      1.1,
      5.2,
    );

    following.current = null;
    flight.current = {
      fromTarget,
      toTarget,
      follow,
      fromDirection,
      toDirection,
      logFromDistance: Math.log(fromDistance),
      logToDistance: Math.log(toDistance),
      hump,
      fovKick: Math.min(1, (zoomRatio + hump) / 4) * 16,
      elapsed: 0,
      duration,
      lastLogDistance: Math.log(fromDistance),
    };
    controls.enabled = false;

    return () => {
      flight.current = null;
      controls.enabled = true;
    };
  }, [focus, view, camera]);

  useFrame((_, rawDelta) => {
    const controls = controlsRef.current;
    if (!controls) return;
    const delta = Math.min(rawDelta, 1 / 20);
    const current = flight.current;

    if (current) {
      current.elapsed += delta;
      const p = Math.min(1, current.elapsed / current.duration);

      // Turn toward the destination early; the dive itself is smoother.
      const targetT = smootherstep(p / 0.6);
      const zoomT = smootherstep(p);

      if (current.follow) current.follow.getWorldPosition(current.toTarget);
      const target = scratchVec.lerpVectors(current.fromTarget, current.toTarget, targetT);

      const logDistance =
        THREE.MathUtils.lerp(current.logFromDistance, current.logToDistance, zoomT) +
        current.hump * Math.sin(Math.PI * zoomT);
      const distance = Math.exp(logDistance);

      const direction = slerpDirection(current.fromDirection, current.toDirection, zoomT, new THREE.Vector3());
      camera.position.copy(target).addScaledVector(direction, distance);
      controls.target.copy(target);

      // Field-of-view kick sells the speed; it settles back by arrival.
      camera.fov = baseFov.current + current.fovKick * Math.pow(Math.sin(Math.PI * p), 2);
      camera.updateProjectionMatrix();

      // Speed in "zoom levels per second" drives the streaks.
      const logSpeed = (logDistance - current.lastLogDistance) / Math.max(delta, 1e-4);
      current.lastLogDistance = logDistance;
      warpSignal.current.intensity = THREE.MathUtils.smoothstep(Math.abs(logSpeed), 0.6, 2.6);
      warpSignal.current.direction = logSpeed < 0 ? 1 : -1;

      controls.update();

      if (p >= 1) {
        flight.current = null;
        controls.enabled = true;
        camera.fov = baseFov.current;
        camera.updateProjectionMatrix();
        if (current.follow) {
          following.current = {
            object: current.follow,
            last: current.follow.getWorldPosition(new THREE.Vector3()),
          };
        }
      }
      return;
    }

    warpSignal.current.intensity = THREE.MathUtils.damp(warpSignal.current.intensity, 0, 6, delta);

    // Ride along with an orbiting planet so it stays centred.
    const ride = following.current;
    if (ride) {
      const now = ride.object.getWorldPosition(scratchVec);
      const shift = now.clone().sub(ride.last);
      if (shift.lengthSq() > 0) {
        camera.position.add(shift);
        controls.target.add(shift);
        ride.last.copy(now);
      }
    }
  });

  return (
    <>
      <OrbitControls
        ref={controlsRef}
        makeDefault
        enableDamping
        dampingFactor={0.12}
        rotateSpeed={0.6}
        zoomSpeed={1.1}
        minDistance={view.minDistance ?? 4}
        maxDistance={view.maxDistance}
        enablePan={false}
      />
      {warp && <WarpStreaks signal={warpSignal} />}
    </>
  );
}

const STREAK_COUNT = 700;

/**
 * Thin light streaks around the camera that stretch and rush past while a
 * flight is diving in (or pulling out). Lives in camera space, so it looks
 * the same at any zoom level.
 */
function WarpStreaks({ signal }: { signal: { current: WarpSignal } }) {
  const seeds = useMemo(() => {
    const data = new Float32Array(STREAK_COUNT * 4);
    for (let i = 0; i < STREAK_COUNT; i += 1) {
      const angle = Math.random() * Math.PI * 2;
      const radius = 0.25 + Math.pow(Math.random(), 0.6) * 1.6;
      data[i * 4] = Math.cos(angle) * radius;
      data[i * 4 + 1] = Math.sin(angle) * radius;
      data[i * 4 + 2] = Math.random(); // phase along the tunnel
      data[i * 4 + 3] = 0.6 + Math.random() * 0.8; // speed
    }
    return data;
  }, []);

  const geometry = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute(
      'position',
      new THREE.BufferAttribute(new Float32Array(STREAK_COUNT * 6), 3).setUsage(THREE.DynamicDrawUsage),
    );
    g.setAttribute(
      'color',
      new THREE.BufferAttribute(new Float32Array(STREAK_COUNT * 6), 3).setUsage(THREE.DynamicDrawUsage),
    );
    return g;
  }, []);
  useEffect(() => () => geometry.dispose(), [geometry]);

  const group = useRef<THREE.Group>(null);
  const lines = useRef<THREE.LineSegments>(null);
  const travel = useRef(0);
  const tint = useMemo(() => new THREE.Color('#cfe0ff'), []);

  // The tunnel lives in camera space, so its transform must be the camera's
  // transform for the frame being drawn. Frame callbacks run before
  // CameraController's own callback, and that is what moves the camera during
  // a flight, so syncing there left the streaks a frame behind: they visibly
  // trailed the camera while zooming in or out. onBeforeRender runs at draw
  // time, once the camera has settled for this frame.
  useEffect(() => {
    const object = lines.current;
    if (!object) return;
    object.onBeforeRender = (_renderer, _scene, cam) => {
      const tunnel = group.current;
      if (!tunnel) return;
      tunnel.position.copy(cam.position);
      tunnel.quaternion.copy(cam.quaternion);
      tunnel.updateMatrixWorld();
    };
    return () => {
      object.onBeforeRender = () => {};
    };
  }, []);

  useFrame((_, rawDelta) => {
    const delta = Math.min(rawDelta, 1 / 20);
    const intensity = signal.current.intensity;
    if (!group.current) return;
    group.current.visible = intensity > 0.01;
    if (!group.current.visible) return;

    travel.current += delta * (0.4 + intensity * 2.2) * signal.current.direction;
    const positions = geometry.getAttribute('position') as THREE.BufferAttribute;
    const colors = geometry.getAttribute('color') as THREE.BufferAttribute;
    const pos = positions.array as Float32Array;
    const col = colors.array as Float32Array;
    const depth = 9;

    for (let i = 0; i < STREAK_COUNT; i += 1) {
      const x = seeds[i * 4];
      const y = seeds[i * 4 + 1];
      const phase = (((seeds[i * 4 + 2] + travel.current * seeds[i * 4 + 3]) % 1) + 1) % 1;
      // z runs from far (-depth) toward the camera (-0.2).
      const z = -0.2 - (1 - phase) * depth;
      const length = (0.15 + intensity * 2.2) * seeds[i * 4 + 3];
      const fade = Math.sin(Math.PI * phase) * intensity * 0.55;

      pos[i * 6] = x;
      pos[i * 6 + 1] = y;
      pos[i * 6 + 2] = z;
      pos[i * 6 + 3] = x;
      pos[i * 6 + 4] = y;
      pos[i * 6 + 5] = z - length;

      col[i * 6] = tint.r * fade;
      col[i * 6 + 1] = tint.g * fade;
      col[i * 6 + 2] = tint.b * fade;
      col[i * 6 + 3] = 0;
      col[i * 6 + 4] = 0;
      col[i * 6 + 5] = 0;
    }
    positions.needsUpdate = true;
    colors.needsUpdate = true;
  });

  return (
    <group ref={group} visible={false}>
      <lineSegments
        ref={lines}
        geometry={geometry}
        frustumCulled={false}
        renderOrder={10}
        raycast={() => null}
      >
        <lineBasicMaterial
          vertexColors
          transparent
          depthWrite={false}
          depthTest={false}
          blending={THREE.AdditiveBlending}
          toneMapped={false}
        />
      </lineSegments>
    </group>
  );
}
