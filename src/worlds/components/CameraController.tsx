import { useEffect, useRef, type ElementRef } from 'react';
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
  /** Fired once when the flight lands, so UI can open after the camera settles. */
  onArrive?: () => void;
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
  onArrive?: () => void;
}

interface CameraControllerProps {
  focus: CameraFocus | null;
  /** Home/target are world-specific so each skin gets its own framing. */
  view: CameraView;
}

function smootherstep(x: number): number {
  const t = Math.min(1, Math.max(0, x));
  return t * t * t * (t * (t * 6 - 15) + 10);
}

const scratchQuat = new THREE.Quaternion();
const identityQuat = new THREE.Quaternion();
const scratchVec = new THREE.Vector3();
const scratchVecB = new THREE.Vector3();
const scratchShift = new THREE.Vector3();

/** Spherical interpolation between two unit vectors. */
function slerpDirection(from: THREE.Vector3, to: THREE.Vector3, t: number, out: THREE.Vector3) {
  scratchQuat.setFromUnitVectors(from, to);
  identityQuat.identity().slerp(scratchQuat, t);
  return out.copy(from).applyQuaternion(identityQuat).normalize();
}

/**
 * OrbitControls plus a cinematic fly-to: the camera swings toward the
 * destination, then dives in at a constant *perceived* speed (distance is
 * interpolated in log space), with a brief field-of-view kick, so a jump from
 * the whole galaxy to a single planet feels like plunging through the stars.
 * Star trails are drawn by StarWarp from the stars' own screen motion.
 */
export function CameraController({ focus, view }: CameraControllerProps) {
  const controlsRef = useRef<ElementRef<typeof OrbitControls>>(null);
  const camera = useThree((state) => state.camera) as THREE.PerspectiveCamera;
  const flight = useRef<Flight | null>(null);
  const following = useRef<{ object: THREE.Object3D; last: THREE.Vector3 } | null>(null);
  const baseFov = useRef(camera.fov);
  /**
   * Smoothed orbit distance. OrbitControls applies a whole wheel notch in one
   * frame, so we glide to it over a few frames. The target has to be stored:
   * the controls read the camera's position each frame and never replay the
   * step, so without it the glide would erase its own destination.
   */
  const zoom = useRef<{ target: number; applied: number } | null>(null);

  // A theme change is a full re-skin: frame the new world immediately.
  useEffect(() => {
    const controls = controlsRef.current;
    if (!controls) return;
    flight.current = null;
    following.current = null;
    zoom.current = null;
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
    zoom.current = null;
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
      onArrive: focus.onArrive,
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

      const direction = slerpDirection(current.fromDirection, current.toDirection, zoomT, scratchVecB);
      camera.position.copy(target).addScaledVector(direction, distance);
      controls.target.copy(target);

      // Field-of-view kick sells the speed; it settles back by arrival.
      camera.fov = baseFov.current + current.fovKick * Math.pow(Math.sin(Math.PI * p), 2);
      camera.updateProjectionMatrix();

      controls.update();

      if (p >= 1) {
        flight.current = null;
        zoom.current = null;
        controls.enabled = true;
        camera.fov = baseFov.current;
        camera.updateProjectionMatrix();
        if (current.follow) {
          following.current = {
            object: current.follow,
            last: current.follow.getWorldPosition(new THREE.Vector3()),
          };
        }
        current.onArrive?.();
      }
      return;
    }

    // Ride along with an orbiting planet so it stays centred.
    const ride = following.current;
    if (ride) {
      const now = ride.object.getWorldPosition(scratchVec);
      const shift = scratchShift.copy(now).sub(ride.last);
      if (shift.lengthSq() > 0) {
        camera.position.add(shift);
        controls.target.add(shift);
        ride.last.copy(now);
      }
    }

    // Glide toward the distance OrbitControls jumped to. A raw wheel notch
    // moves the camera a tenth of the way in one frame, which made the star
    // streaks flare and die instantly; easing it out keeps them continuous.
    const offset = scratchVec.copy(camera.position).sub(controls.target);
    const rawDistance = offset.length();
    if (rawDistance > 1e-5) {
      let state = zoom.current;
      if (!state) {
        state = { target: rawDistance, applied: rawDistance };
        zoom.current = state;
      } else if (Math.abs(rawDistance - state.applied) > Math.max(1e-3, state.applied * 1e-4)) {
        // The controls moved the camera behind our back: a wheel notch or pinch.
        state.target = rawDistance;
      }
      state.applied += (state.target - state.applied) * (1 - Math.exp(-delta * 11));
      if (Math.abs(state.target - state.applied) < 1e-3) state.applied = state.target;
      if (state.applied !== rawDistance) {
        camera.position
          .copy(controls.target)
          .add(offset.multiplyScalar(state.applied / rawDistance));
      }
    }
  });

  return (
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
  );
}
