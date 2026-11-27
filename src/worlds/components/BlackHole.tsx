import { useMemo, useRef, useState } from 'react';
import { Html } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

/** Schwarzschild radius (event horizon) in world units. */
const SCHWARZSCHILD_RADIUS = 1.2;
/** Bounding sphere for the ray-marched volume, in world units (10 rs). */
const BOUND_RADIUS = SCHWARZSCHILD_RADIUS * 10;
/** Slight tilt of the accretion disk off the galaxy plane (radians). */
const DISK_TILT: [number, number, number] = [0.13, 0, -0.07];

const VERTEX = /* glsl */ `
  varying vec3 vLocalPosition;

  void main() {
    vLocalPosition = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

/*
 * Everything below works in units of the Schwarzschild radius (rs = 1),
 * in the black hole's local frame (disk lies in the local XZ plane).
 *
 * Light rays are bent by integrating the photon-orbit equation
 *   a = -1.5 * h^2 * x / |x|^5
 * so the arch over the top, the inverted image below, and the thin photon
 * ring all appear naturally instead of being painted on.
 */
const FRAGMENT = /* glsl */ `
  precision highp float;

  uniform float uTime;
  uniform vec3 uCameraLocal;
  uniform float uScale;
  uniform float uExposure;

  varying vec3 vLocalPosition;

  const float BOUND = 10.0;
  const float DISK_IN = 2.6;
  const float DISK_OUT = 9.2;

  float hash31(vec3 p) {
    p = fract(p * 0.3183099 + vec3(0.71, 0.113, 0.419));
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
  }

  float noise3(vec3 p) {
    vec3 i = floor(p);
    vec3 f = fract(p);
    vec3 u = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(
        mix(hash31(i), hash31(i + vec3(1, 0, 0)), u.x),
        mix(hash31(i + vec3(0, 1, 0)), hash31(i + vec3(1, 1, 0)), u.x),
        u.y),
      mix(
        mix(hash31(i + vec3(0, 0, 1)), hash31(i + vec3(1, 0, 1)), u.x),
        mix(hash31(i + vec3(0, 1, 1)), hash31(i + vec3(1, 1, 1)), u.x),
        u.y),
      u.z);
  }

  float fbm3(vec3 p) {
    float value = 0.0;
    float amplitude = 0.5;
    for (int i = 0; i < 4; i += 1) {
      value += amplitude * noise3(p);
      p = p * 2.07 + vec3(1.7, 9.2, 3.1);
      amplitude *= 0.5;
    }
    return value;
  }

  // Three octaves for the finest radial banding only: at that frequency the
  // fourth octave is far below a pixel and only costs 8 hashes per sample.
  float fbm3fine(vec3 p) {
    float value = 0.0;
    float amplitude = 0.5;
    for (int i = 0; i < 3; i += 1) {
      value += amplitude * noise3(p);
      p = p * 2.07 + vec3(1.7, 9.2, 3.1);
      amplitude *= 0.5;
    }
    return value * 1.0714; // same 0..0.9375 amplitude and mean as the 4-octave version
  }

  // Muted blackbody-ish ramp: ember red -> deep orange -> amber -> pale gold.
  vec3 temperatureColor(float t) {
    t = clamp(t, 0.0, 1.0);
    vec3 ember = vec3(0.42, 0.04, 0.005);
    vec3 orange = vec3(1.0, 0.26, 0.02);
    vec3 amber = vec3(1.0, 0.5, 0.1);
    vec3 pale = vec3(1.0, 0.8, 0.55);
    vec3 color = mix(ember, orange, smoothstep(0.0, 0.45, t));
    color = mix(color, amber, smoothstep(0.45, 0.8, t));
    return mix(color, pale, smoothstep(0.8, 1.0, t));
  }

  // Emission (rgb, premultiplied) and coverage (a) where a ray crosses the disk.
  vec4 sampleDisk(vec3 p, vec3 rayDir) {
    float r = length(p.xz);
    if (r < DISK_IN || r > DISK_OUT) return vec4(0.0);

    float innerEdge = smoothstep(DISK_IN, DISK_IN + 0.25, r);
    float outerEdge = 1.0 - smoothstep(DISK_OUT * 0.62, DISK_OUT, r);

    // Keplerian rotation: inner gas whips round in seconds, outer gas drifts.
    // Noise is sampled on a circle so there is no seam at the atan wrap.
    float phi = atan(p.z, p.x);
    float omega = 4.2 * pow(r, -1.5);
    float a = phi - uTime * omega;
    vec2 ring = vec2(cos(a), sin(a));

    // Shifting the radial noise coordinate over time makes the whole pattern
    // spiral slowly inward, like gas actually being swallowed.
    float inflow = uTime * 0.14;

    // Sheared streaks with fine radial banding.
    float broad = fbm3(vec3(ring * 1.4, r * 2.2 + inflow));
    float fine = fbm3fine(vec3(ring * 2.2, r * 6.5 + 4.0 + inflow * 1.6));
    float gas = smoothstep(0.3, 0.8, broad * 0.55 + fine * 0.5);
    float lanes = 0.7 + 0.3 * smoothstep(0.3, 0.7, noise3(vec3(ring * 0.6, r * 13.0 + inflow * 2.0)));

    // Compact hot clumps riding the flow: short features the eye can track,
    // so the rotation reads clearly instead of streaks sliding along themselves.
    float clumpField = fbm3(vec3(ring * 4.5, r * 2.6 + inflow * 1.2 + 11.0));
    float clumps = smoothstep(0.52, 0.78, clumpField);

    // Slow turbulent flicker so brightness keeps breathing.
    float flicker = 0.82 + 0.36 * noise3(vec3(ring * 2.0, r * 0.8 + uTime * 0.55));

    float density = gas * lanes + clumps * 0.55;

    // Thin-disk temperature profile, hottest just outside the inner edge.
    float temperature = pow(DISK_IN / r, 0.75) * pow(max(1.0 - sqrt(DISK_IN * 0.92 / r), 0.0), 0.25);
    temperature = clamp(temperature * 2.1, 0.0, 1.0);

    // Relativistic Doppler beaming: the side rotating toward us is brighter.
    vec3 velocity = normalize(vec3(-p.z, 0.0, p.x));
    float beta = 0.62 / sqrt(2.0 * r);
    float gamma = inversesqrt(1.0 - beta * beta);
    float cosTheta = dot(velocity, -normalize(rayDir));
    float doppler = 1.0 / (gamma * (1.0 - beta * cosTheta));
    float redshift = sqrt(max(1.0 - 1.0 / r, 0.0));
    float shift = doppler * redshift;

    float intensity = 2.0 * pow(temperature, 1.5) * pow(shift, 2.2) * (0.45 + 0.9 * density) * flicker;
    vec3 color = temperatureColor(temperature * mix(1.0, shift, 0.6) * 0.78) * intensity;

    float coverage = clamp((0.55 + 0.45 * min(density, 1.0)) * innerEdge * outerEdge, 0.0, 1.0);
    return vec4(color * coverage, coverage);
  }

  void main() {
    vec3 ro = uCameraLocal / uScale;
    vec3 rd = normalize(vLocalPosition / uScale - ro);

    // Enter the bounding sphere (or start at the camera if already inside).
    float b = dot(ro, rd);
    float c = dot(ro, ro) - BOUND * BOUND;
    float disc = b * b - c;
    if (disc < 0.0) discard;
    float tNear = max(-b - sqrt(disc), 0.0);

    vec3 pos = ro + rd * tNear;
    vec3 dir = rd;
    vec3 angular = cross(pos, dir);
    float h2 = dot(angular, angular);

    vec3 color = vec3(0.0);
    float alpha = 0.0;
    float haze = 0.0;
    bool captured = false;

    for (int i = 0; i < 260; i += 1) {
      float r2 = dot(pos, pos);
      float r = sqrt(r2);
      if (r < 1.0) {
        captured = true;
        break;
      }
      if (r > BOUND + 0.01 && dot(pos, dir) > 0.0) break;

      // Small steps near the hole, larger ones far away. r * r is exactly r2,
      // and one inversesqrt replaces the sqrt plus the r^5 division.
      float dt = clamp(0.045 * r2, 0.03, 0.6);
      float ir = inversesqrt(r2);
      vec3 accel = -1.5 * h2 * ir * ir * ir * ir * ir * pos;
      vec3 nextDir = dir + accel * dt;
      vec3 nextPos = pos + nextDir * dt;

      // Disk crossing (local y = 0 plane).
      if (pos.y * nextPos.y < 0.0) {
        float f = pos.y / (pos.y - nextPos.y);
        vec4 disk = sampleDisk(mix(pos, nextPos, f), nextDir);
        color += (1.0 - alpha) * disk.rgb;
        alpha += (1.0 - alpha) * disk.a;
        if (alpha > 0.995) break;
      }

      // Faint glowing gas hugging the disk plane, for depth. Beyond two units
      // of the plane the term is wholly invisible (exp(-7) * 0.012), so skip
      // its exp/smoothstep work instead of evaluating it on every step.
      if (abs(nextPos.y) < 2.0) {
        float rho = length(nextPos.xz);
        haze += exp(-abs(nextPos.y) * 3.5) *
          smoothstep(DISK_IN, DISK_IN + 1.0, rho) *
          (1.0 - smoothstep(4.0, DISK_OUT, rho)) * dt * 0.012;
      }

      pos = nextPos;
      dir = nextDir;
    }

    color += (1.0 - alpha) * vec3(0.9, 0.28, 0.06) * haze;
    alpha += (1.0 - alpha) * clamp(haze * 0.6, 0.0, 1.0);

    // The shadow: light that fell in never comes back.
    if (captured) alpha = 1.0;

    // Hue-preserving roll-off on luminance: highlights compress instead of
    // clipping, and the disk stays deep orange rather than washing to yellow.
    float luminance = dot(color, vec3(0.2126, 0.7152, 0.0722));
    vec3 mapped = luminance > 1e-5
      ? color * ((1.0 - exp(-luminance * uExposure * 2.2)) / luminance)
      : vec3(0.0);
    mapped = min(mapped, vec3(1.0));
    gl_FragColor = vec4(mapped, clamp(alpha, 0.0, 1.0));
  }
`;

interface BlackHoleProps {
  onSelect?: () => void;
}

export function BlackHole({ onSelect }: BlackHoleProps = {}) {
  const meshRef = useRef<THREE.Mesh>(null);
  const materialRef = useRef<THREE.ShaderMaterial>(null);
  const timeRef = useRef(0);
  const [hovered, setHovered] = useState(false);

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uCameraLocal: { value: new THREE.Vector3() },
      uScale: { value: SCHWARZSCHILD_RADIUS },
      uExposure: { value: 1.6 },
    }),
    [],
  );

  useFrame((state, delta) => {
    timeRef.current += Math.min(delta, 1 / 20);
    const mesh = meshRef.current;
    const material = materialRef.current;
    if (!mesh || !material) return;

    material.uniforms.uTime.value = timeRef.current;
    mesh.updateWorldMatrix(true, false);
    const local = mesh.worldToLocal(material.uniforms.uCameraLocal.value.copy(state.camera.position));

    // Inside the volume we need the far faces, otherwise the near ones.
    material.side = local.length() < BOUND_RADIUS ? THREE.BackSide : THREE.FrontSide;
  });

  return (
    <group rotation={DISK_TILT}>
      <mesh
        ref={meshRef}
        renderOrder={1}
        onClick={(event) => {
          event.stopPropagation();
          onSelect?.();
        }}
        onPointerOver={(event) => {
          event.stopPropagation();
          setHovered(true);
          document.body.style.cursor = 'pointer';
          onSelect?.();
        }}
        onPointerOut={() => {
          setHovered(false);
          document.body.style.cursor = '';
        }}
      >
        <sphereGeometry args={[BOUND_RADIUS, 64, 48]} />
        <shaderMaterial
          ref={materialRef}
          uniforms={uniforms}
          vertexShader={VERTEX}
          fragmentShader={FRAGMENT}
          transparent
          depthWrite={false}
          side={THREE.FrontSide}
          toneMapped={false}
        />
      </mesh>
      {hovered && (
        <Html position={[0, 5.5, 0]} center zIndexRange={[60, 0]} style={{ pointerEvents: 'none' }}>
          <div className="hud-panel w-max max-w-[16rem] px-3 py-2 text-left">
            <p className="text-[9px] font-semibold uppercase tracking-[0.18em] text-slate-300">
              Black hole
            </p>
            <p className="mt-1 text-[11px] leading-relaxed text-slate-200">
              A region where gravity is so strong that nothing, not even light,
              can escape.
            </p>
          </div>
        </Html>
      )}
    </group>
  );
}
