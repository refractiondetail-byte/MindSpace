import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';

/**
 * Picks a manageable set of the star points that are actually visible: the
 * brightest (largest) ones, topped up with a regular sample of the rest. The
 * trail heads are then exactly where a rendered particle sits.
 */
export function selectWarpStars(
  geometry: THREE.BufferGeometry,
  limit = 3000,
): { positions: Float32Array; colors: Float32Array } {
  const position = geometry.getAttribute('position');
  const color = geometry.getAttribute('aColor');
  const size = geometry.getAttribute('aSize');
  if (!position || !color) {
    return { positions: new Float32Array(0), colors: new Float32Array(0) };
  }

  const count = position.count;
  const positions = position.array as Float32Array;
  const colors = color.array as Float32Array;
  const sizes = size ? (size.array as Float32Array) : null;
  const giantSize = 1.4;

  const picks: number[] = [];
  if (sizes) {
    const giants: number[] = [];
    for (let index = 0; index < count; index += 1) {
      if (sizes[index] >= giantSize) giants.push(index);
    }
    // Giants are ~2% of the field; stride them if there are a lot.
    const stride = Math.max(1, Math.ceil(giants.length / (limit * 0.65)));
    for (let index = 0; index < giants.length; index += stride) {
      picks.push(giants[index]);
    }
  }

  // Fill the rest with an even sample across the disk, skipping giants already
  // picked so the trails stay spread over the galaxy.
  const remaining = limit - picks.length;
  if (remaining > 0) {
    const stride = Math.max(1, Math.floor(count / remaining));
    for (let index = 0; index < count && picks.length < limit; index += stride) {
      if (sizes && sizes[index] >= giantSize) continue;
      picks.push(index);
    }
  }

  const outPositions = new Float32Array(picks.length * 3);
  const outColors = new Float32Array(picks.length * 3);
  picks.forEach((index, slot) => {
    outPositions[slot * 3] = positions[index * 3];
    outPositions[slot * 3 + 1] = positions[index * 3 + 1];
    outPositions[slot * 3 + 2] = positions[index * 3 + 2];
    outColors[slot * 3] = colors[index * 3];
    outColors[slot * 3 + 1] = colors[index * 3 + 1];
    outColors[slot * 3 + 2] = colors[index * 3 + 2];
  });

  return { positions: outPositions, colors: outColors };
}

/**
 * Warp trails are the stars themselves, stretched along their real screen-space
 * motion. Each frame the star is projected with this frame's and the previous
 * frame's view-projection matrix; the difference gives the direction and speed
 * it is sweeping across the screen. Diving in makes stars flare outward, pulling
 * back makes them converge, and a sideways move streaks them sideways — the
 * trails always follow the actual travel instead of sitting in front of the
 * camera.
 */

const VERTEX_SHADER = /* glsl */ `
  attribute vec3 aColor;
  attribute float aAlpha;

  varying vec3 vColor;
  varying float vAlpha;

  void main() {
    vColor = aColor;
    vAlpha = aAlpha;
    // Positions are already in clip space: no camera transform applied.
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

const FRAGMENT_SHADER = /* glsl */ `
  varying vec3 vColor;
  varying float vAlpha;

  void main() {
    // Additive, untonemapped: pushing past 1.0 makes the heads burn white and
    // brightens wherever streaks overlap, which is what reads as "warp".
    gl_FragColor = vec4(vColor * vAlpha * 2.2, 1.0);
  }
`;

/** Frames of screen motion a tail covers. */
const TAIL_FRAMES = 150;
/** Longest trail, in normalised device coordinates. */
const MAX_TAIL = 1.2;
/** Screen motion (NDC per 60 fps frame) at which trails reach full strength. */
const FULL_SPEED = 0.0009;
/** Peak opacity of a streak; additive, so it stays a glow rather than a beam. */
const MAX_ALPHA = 1.0;
/** Below this the star is effectively parked; keeps idle jitter dark. */
const MIN_SPEED = 6e-5;

export function StarWarp({
  positions,
  colors,
}: {
  /** Flattened star positions in world space. */
  positions: Float32Array;
  /** Flattened star colours matching `positions`. */
  colors: Float32Array;
}) {
  const count = Math.floor(positions.length / 3);
  const linesRef = useRef<THREE.LineSegments>(null);

  const geometry = useMemo(() => {
    const buffer = new THREE.BufferGeometry();
    buffer.setAttribute(
      'position',
      new THREE.BufferAttribute(new Float32Array(count * 6), 3).setUsage(THREE.DynamicDrawUsage),
    );
    buffer.setAttribute(
      'aColor',
      new THREE.BufferAttribute(new Float32Array(count * 6), 3).setUsage(THREE.DynamicDrawUsage),
    );
    buffer.setAttribute(
      'aAlpha',
      new THREE.BufferAttribute(new Float32Array(count * 2), 1).setUsage(THREE.DynamicDrawUsage),
    );
    buffer.setDrawRange(0, count * 2);
    return buffer;
  }, [count]);

  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: VERTEX_SHADER,
        fragmentShader: FRAGMENT_SHADER,
        transparent: true,
        depthTest: false,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
      }),
    [],
  );

  useEffect(
    () => () => {
      geometry.dispose();
      material.dispose();
    },
    [geometry, material],
  );

  // Star colours never change; write them once per geometry.
  useEffect(() => {
    const attribute = geometry.getAttribute('aColor') as THREE.BufferAttribute;
    const array = attribute.array as Float32Array;
    for (let index = 0; index < count; index += 1) {
      const r = colors[index * 3];
      const g = colors[index * 3 + 1];
      const b = colors[index * 3 + 2];
      const i6 = index * 6;
      array[i6] = r;
      array[i6 + 1] = g;
      array[i6 + 2] = b;
      array[i6 + 3] = r;
      array[i6 + 4] = g;
      array[i6 + 5] = b;
    }
    attribute.needsUpdate = true;
  }, [colors, count, geometry]);

  const work = useMemo(
    () => ({
      viewProjection: new THREE.Matrix4(),
      previousViewProjection: new THREE.Matrix4(),
      current: new THREE.Vector4(),
      previous: new THREE.Vector4(),
      started: false,
      lastTime: 0,
      settled: true,
    }),
    [],
  );

  useEffect(() => {
    const object = linesRef.current;
    if (!object) return;

    const positionAttribute = geometry.getAttribute('position') as THREE.BufferAttribute;
    const alphaAttribute = geometry.getAttribute('aAlpha') as THREE.BufferAttribute;
    const pos = positionAttribute.array as Float32Array;
    const alpha = alphaAttribute.array as Float32Array;

    object.onBeforeRender = (_renderer, _scene, camera) => {
      // onBeforeRender runs at draw time, after every camera update for this
      // frame, so the streaks are never a frame behind the view.
      work.viewProjection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
      if (!work.started) {
        work.previousViewProjection.copy(work.viewProjection);
        work.started = true;
      }

      // Camera parked and every trail faded: nothing to recompute or upload.
      if (work.settled && work.previousViewProjection.equals(work.viewProjection)) return;

      const now = performance.now();
      const dt = work.lastTime ? Math.min((now - work.lastTime) / 1000, 0.05) : 1 / 60;
      work.lastTime = now;
      // Normalise motion to 60 fps steps so trail length is refresh-rate
      // independent.
      const steps = Math.max(0.25, Math.min(dt * 60, 3));

      let visible = false;

      for (let index = 0; index < count; index += 1) {
        const x = positions[index * 3];
        const y = positions[index * 3 + 1];
        const z = positions[index * 3 + 2];
        const i6 = index * 6;
        const i2 = index * 2;

        work.current.set(x, y, z, 1).applyMatrix4(work.viewProjection);
        work.previous.set(x, y, z, 1).applyMatrix4(work.previousViewProjection);

        // Behind the camera on either frame: no meaningful screen position.
        if (work.current.w <= 1e-4 || work.previous.w <= 1e-4) {
          alpha[i2] = 0;
          alpha[i2 + 1] = 0;
          pos[i6] = 0;
          pos[i6 + 1] = 0;
          pos[i6 + 2] = 0;
          pos[i6 + 3] = 0;
          pos[i6 + 4] = 0;
          pos[i6 + 5] = 0;
          continue;
        }

        const cx = work.current.x / work.current.w;
        const cy = work.current.y / work.current.w;
        const px = work.previous.x / work.previous.w;
        const py = work.previous.y / work.previous.w;

        const dx = (cx - px) / steps;
        const dy = (cy - py) / steps;
        const speed = Math.hypot(dx, dy);

        // A star sweeping past the edge can still have half its streak on
        // screen, so fade it out over a few frames instead of cutting it.
        const offscreen = Math.abs(cx) > 1.05 || Math.abs(cy) > 1.05;
        // Wheel zoom moves every star far slower than a spin does (around
        // 0.001 NDC/frame versus 0.02), so respond on a square-root curve:
        // gentle motion already reads, while a hard spin still just saturates.
        const ramp =
          speed > MIN_SPEED ? Math.min(1, Math.pow(speed / FULL_SPEED, 0.45)) : 0;
        const target = offscreen ? 0 : ramp * MAX_ALPHA;

        let value = alpha[i2] + (target - alpha[i2]) * (offscreen ? 0.35 : 0.32);
        if (value < 0.002) value = 0;
        alpha[i2] = value;
        alpha[i2 + 1] = 0;
        if (value > 0) visible = true;

        // Length follows how far the star actually moved this frame. Stars
        // near the direction of travel barely shift, so they stay short
        // instead of every streak funnelling into one bright point.
        const tail = Math.min(speed * TAIL_FRAMES, MAX_TAIL);

        // Keep extreme near-lens projections out of the buffer; they fade out
        // and the visible part of the line is clipped at the viewport edge.
        pos[i6] = THREE.MathUtils.clamp(cx, -4, 4);
        pos[i6 + 1] = THREE.MathUtils.clamp(cy, -4, 4);
        pos[i6 + 2] = 0;
        pos[i6 + 3] = THREE.MathUtils.clamp(cx - dx * tail, -4, 4);
        pos[i6 + 4] = THREE.MathUtils.clamp(cy - dy * tail, -4, 4);
        pos[i6 + 5] = 0;
      }

      positionAttribute.needsUpdate = true;
      alphaAttribute.needsUpdate = true;
      work.previousViewProjection.copy(work.viewProjection);
      work.settled = !visible;
    };

    return () => {
      object.onBeforeRender = () => {};
    };
  }, [count, geometry, positions, work]);

  return (
    <lineSegments
      ref={linesRef}
      geometry={geometry}
      material={material}
      frustumCulled={false}
      renderOrder={9}
      raycast={() => null}
    />
  );
}
