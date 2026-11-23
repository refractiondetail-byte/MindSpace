import { useEffect, useRef, type ElementRef } from 'react';
import { OrbitControls } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { CAMERA_TARGET, FOCUS_DISTANCE, HOME_DISTANCE, type Vec3 } from '../layout';

export interface CameraFocus {
  /** `null` requests the home view. */
  position: Vec3 | null;
  /** Changes on every request so re-selecting the same node flies again. */
  token: number;
}

interface Flight {
  fromPosition: THREE.Vector3;
  toPosition: THREE.Vector3;
  fromTarget: THREE.Vector3;
  toTarget: THREE.Vector3;
  elapsed: number;
  duration: number;
}

interface CameraControllerProps {
  focus: CameraFocus | null;
}

/** OrbitControls plus eased fly-to when a node or search result is chosen. */
export function CameraController({ focus }: CameraControllerProps) {
  const controlsRef = useRef<ElementRef<typeof OrbitControls>>(null);
  const { camera } = useThree();
  const flight = useRef<Flight | null>(null);

  useEffect(() => {
    const controls = controlsRef.current;
    if (!controls) return;
    controls.target.set(...CAMERA_TARGET);
  }, []);

  useEffect(() => {
    const controls = controlsRef.current;
    if (!controls || !focus) return;

    const destination = new THREE.Vector3(...(focus.position ?? CAMERA_TARGET));
    const direction = new THREE.Vector3().subVectors(camera.position, controls.target);
    if (direction.lengthSq() < 0.001) direction.set(0.25, 0.3, 1);
    direction.normalize();

    flight.current = {
      fromPosition: camera.position.clone(),
      toPosition: destination
        .clone()
        .addScaledVector(direction, focus.position ? FOCUS_DISTANCE : HOME_DISTANCE),
      fromTarget: controls.target.clone(),
      toTarget: destination,
      elapsed: 0,
      duration: focus.position ? 0.85 : 1.1,
    };
    controls.enabled = false;

    return () => {
      flight.current = null;
      controls.enabled = true;
    };
  }, [focus, camera]);

  useFrame((_, delta) => {
    const controls = controlsRef.current;
    const current = flight.current;
    if (!controls || !current) return;

    current.elapsed += delta;
    const progress = Math.min(1, current.elapsed / current.duration);
    const eased =
      progress < 0.5 ? 4 * progress ** 3 : 1 - (-2 * progress + 2) ** 3 / 2;

    camera.position.lerpVectors(current.fromPosition, current.toPosition, eased);
    controls.target.lerpVectors(current.fromTarget, current.toTarget, eased);
    controls.update();

    if (progress >= 1) {
      flight.current = null;
      controls.enabled = true;
    }
  });

  return (
    <OrbitControls
      ref={controlsRef}
      makeDefault
      enableDamping
      dampingFactor={0.075}
      rotateSpeed={0.6}
      zoomSpeed={0.8}
      minDistance={5}
      maxDistance={110}
      enablePan={false}
    />
  );
}
