import { useMemo, useRef, useState } from 'react';
import { Billboard, Html } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

const NO_RAYCAST = () => null;

/**
 * Three independent disk layers plus a camera-facing lens that bends starlight.
 * Each layer travels at its own speed, tilts in its own direction, and brightens
 * along its own approaching side so the whole structure breathes and swirls
 * instead of behaving like a single static cutout.
 */
const DISKS = [
  {
    tilt: [Math.PI / 2 - 0.20, 0.10, 0.16] as const,
    inner: 2.85,
    outer: 12.0,
    spinBase: 1.0,
    spinFalloff: 0.16,
    noiseScale: 0.6,
    dopplerSide: 2.35,
    rimWidth: 0.55,
    rimRadius: 3.1,
  },
] as const;

const DISK_VERTEX = /* glsl */ `
  varying vec2 vDisk;

  void main() {
    vDisk = position.xy;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const DISK_FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform float uInner;
  uniform float uOuter;
  uniform float uSpinBase;
  uniform float uSpinFalloff;
  uniform float uNoiseScale;
  uniform float uDopplerSide;
  uniform float uRimWidth;
  uniform float uRimRadius;

  varying vec2 vDisk;

  float hash21(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }

  float vnoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    float a = hash21(i);
    float b = hash21(i + vec2(1.0, 0.0));
    float c = hash21(i + vec2(0.0, 1.0));
    float d = hash21(i + vec2(1.0, 1.0));
    return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
  }

  float fbm(vec2 p) {
    float value = 0.0;
    float amplitude = 0.5;
    for (int octave = 0; octave < 4; octave += 1) {
      value += amplitude * vnoise(p);
      p *= 2.03;
      amplitude *= 0.5;
    }
    return value;
  }

  void main() {
    float radius = length(vDisk);
    if (radius < uInner || radius > uOuter) discard;

    float angle = atan(vDisk.y, vDisk.x);
    float rotation = uTime * (uSpinBase / (0.85 + radius * uSpinFalloff));
    float spin = angle + rotation;

    // Orbiting turbulence in the rotating frame, with no texture seams.
    vec2 polar = vec2(cos(spin), sin(spin)) * radius;
    float n1 = fbm(polar * uNoiseScale + vec2(0.0, radius * 0.35) + uTime * 0.02);
    float n2 = fbm(
      polar * (uNoiseScale * 2.2) +
        vec2(n1 * 2.2, radius * 0.7) -
        uTime * 0.03
    );
    float fine = pow(
      0.5 +
        0.5 * sin(spin * 26.0 - radius * 2.8 + n2 * 8.0 + uTime * 0.4),
      5.0
    );
    float bands = 0.5 + 0.5 * sin(spin * 7.0 + radius * 1.6 + n2 * 5.0);

    float density;
    if (radius < uRimRadius + uRimWidth) {
      density = 1.0 - smoothstep(uRimRadius - uRimWidth, uRimRadius, radius);
    } else {
      density = 1.0 - smoothstep(uOuter - (uOuter - uRimRadius) * 0.5, uOuter, radius);
    }

    density *= smoothstep(uInner, uInner + (uOuter - uInner) * 0.12, radius);

    float heat = clamp((uRimRadius * 1.6 - radius) / 5.0, 0.0, 1.0);

    // Brightest along one approaching side; the far side stays amber.
    float doppler = 0.2 + 0.8 * pow(0.5 + 0.5 * cos(angle - uDopplerSide), 2.0);

    vec3 ember = vec3(0.5, 0.12, 0.02);
    vec3 amber = vec3(1.0, 0.55, 0.16);
    vec3 whiteGold = vec3(1.0, 0.95, 0.84);
    vec3 color = mix(ember, amber, 0.25 + heat * 0.75);
    color = mix(
      color,
      whiteGold,
      pow(max(0.0, heat - 0.3), 1.4) * 1.1
    );

    float alpha =
      density *
      (0.18 + 0.45 * n1 + 0.22 * n2 + 0.16 * fine + 0.12 * bands) *
      (0.35 + 0.65 * doppler);

    float hotRim = exp(-pow((radius - uRimRadius) / uRimWidth, 2.0));
    color += whiteGold * hotRim * 0.9;
    alpha += hotRim * 0.2;

    gl_FragColor = vec4(
      color * (0.7 + heat * 1.5),
      clamp(alpha * 0.9, 0.0, 1.0)
    );
  }
`;

const PHOTON_VERTEX = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const PHOTON_FRAGMENT = /* glsl */ `
  uniform float uTime;
  varying vec2 vUv;

  void main() {
    vec2 p = vUv - 0.5;
    float r = length(p) * 2.0;
    float angle = atan(p.y, p.x);
    float ring = smoothstep(0.82, 0.90, r) * smoothstep(1.08, 0.96, r);
    float flow = 0.5 + 0.5 * sin(angle * 8.0 - uTime * 4.0);
    float pulse = 0.75 + 0.25 * sin(uTime * 2.4);
    float bend = 0.5 + 0.5 * sin(angle * 3.0 + uTime * 1.6);
    vec3 base = vec3(1.0, 0.88, 0.62);
    vec3 hot = vec3(1.0, 1.0, 0.95);
    vec3 color = mix(base, hot, flow * bend);
    float alpha = ring * (0.35 + 0.65 * flow) * pulse;
    gl_FragColor = vec4(color * (1.2 + 0.8 * flow), clamp(alpha, 0.0, 1.0));
  }
`;

const LENS_VERTEX = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const LENS_FRAGMENT = /* glsl */ `
  uniform float uTime;
  varying vec2 vUv;

  void main() {
    vec2 p = vUv - 0.5;
    float r = length(p) * 2.0;
    float angle = atan(p.y, p.x);
    float ring = smoothstep(0.90, 0.96, r) * smoothstep(1.12, 1.0, r);
    float wave = 0.5 + 0.5 * sin(angle * 5.0 + uTime * 2.0);
    float pulse = 0.6 + 0.4 * sin(uTime * 1.7 + angle * 2.0);
    vec3 color = vec3(0.75, 0.85, 1.0);
    float alpha = ring * wave * pulse * 0.45;
    gl_FragColor = vec4(color, clamp(alpha, 0.0, 1.0));
  }
`;

/**
 * Pitch-black horizon core, bright white-gold animated photon ring, and a
 * fainter lensing ring that wobbles to suggest bending light.
 */
interface BlackHoleProps {
  onSelect?: () => void;
}

export function BlackHole({ onSelect }: BlackHoleProps = {}) {
  const uniforms = useMemo(() => ({ uTime: { value: 0 } }), []);
  const photonUniforms = useMemo(() => ({ uTime: { value: 0 } }), []);
  const lensUniforms = useMemo(() => ({ uTime: { value: 0 } }), []);
  const groupRef = useRef<THREE.Group>(null);
  const photonRef = useRef<THREE.Mesh>(null);
  const lensRef = useRef<THREE.Mesh>(null);
  const [hovered, setHovered] = useState(false);

  useFrame((state, delta) => {
    uniforms.uTime.value = state.clock.elapsedTime;
    photonUniforms.uTime.value = state.clock.elapsedTime;
    lensUniforms.uTime.value = state.clock.elapsedTime;
    if (groupRef.current) {
      const target = hovered ? 1.18 : 1;
      const next = THREE.MathUtils.damp(groupRef.current.scale.x, target, 8, delta);
      groupRef.current.scale.setScalar(next);
    }
    if (photonRef.current) {
      photonRef.current.rotation.z = state.clock.elapsedTime * 0.6;
    }
    if (lensRef.current) {
      lensRef.current.rotation.z = -state.clock.elapsedTime * 0.35;
    }
  });

  return (
    <group
      ref={groupRef}
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
      {/* Clickable hitbox for opening the black hole info card. */}
      <mesh
        onClick={(event) => {
          event.stopPropagation();
          onSelect?.();
        }}
        onPointerOver={() => {
          document.body.style.cursor = 'pointer';
        }}
        onPointerOut={() => {
          document.body.style.cursor = '';
        }}
      >
        <sphereGeometry args={[4.2, 32, 32]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>

      {/* Pitch-black event horizon. */}
      <mesh raycast={NO_RAYCAST} renderOrder={0}>
        <sphereGeometry args={[2.9, 64, 64]} />
        <meshBasicMaterial color="#000000" />
      </mesh>

      {/* Animated photon ring that suggests light bending around the horizon. */}
      <Billboard>
        <mesh ref={photonRef} raycast={NO_RAYCAST} renderOrder={4}>
          <ringGeometry args={[2.95, 3.12, 128]} />
          <shaderMaterial
            uniforms={photonUniforms}
            vertexShader={PHOTON_VERTEX}
            fragmentShader={PHOTON_FRAGMENT}
            transparent
            depthWrite={false}
            side={THREE.DoubleSide}
            blending={THREE.AdditiveBlending}
            toneMapped={false}
          />
        </mesh>
      </Billboard>

      {/* Fainter lensing ring that wobbles around the photon ring. */}
      <Billboard>
        <mesh ref={lensRef} raycast={NO_RAYCAST} renderOrder={3}>
          <ringGeometry args={[3.3, 3.6, 128]} />
          <shaderMaterial
            uniforms={lensUniforms}
            vertexShader={LENS_VERTEX}
            fragmentShader={LENS_FRAGMENT}
            transparent
            depthWrite={false}
            side={THREE.DoubleSide}
            blending={THREE.AdditiveBlending}
            toneMapped={false}
          />
        </mesh>
      </Billboard>

      {hovered && (
        <Html position={[0, 4.6, 0]} center zIndexRange={[60, 0]} style={{ pointerEvents: 'none' }}>
          <div className="hud-panel w-max max-w-[16rem] px-3 py-2 text-left">
            <p className="text-[9px] font-semibold uppercase tracking-[0.18em] text-slate-300">
              Black hole
            </p>
            <p className="mt-1 text-[11px] leading-relaxed text-slate-200">
              A region where gravity is so strong that nothing, not even light,
              can escape.
            </p>
            <ul className="mt-1.5 space-y-0.5 text-[10px] text-slate-400">
              <li>• Event horizon: point of no return</li>
              <li>• Singularity: concentrated mass at center</li>
              <li>• Lensing: light bends around the hole</li>
              <li>• Accretion disk: superheated matter spiraling inward</li>
            </ul>
          </div>
        </Html>
      )}

      {/* Multiple independent accretion-disk layers. */}
      {DISKS.map((config, index) => (
        <group
          key={index}
          rotation={new THREE.Euler(...config.tilt)}
          renderOrder={index + 1}
        >
          <mesh raycast={NO_RAYCAST}>
            <ringGeometry args={[config.inner, config.outer, 256, 48]} />
            <shaderMaterial
              uniforms={{
                uTime: uniforms.uTime,
                uInner: { value: config.inner },
                uOuter: { value: config.outer },
                uSpinBase: { value: config.spinBase },
                uSpinFalloff: { value: config.spinFalloff },
                uNoiseScale: { value: config.noiseScale },
                uDopplerSide: { value: config.dopplerSide },
                uRimWidth: { value: config.rimWidth },
                uRimRadius: { value: config.rimRadius },
              }}
              vertexShader={DISK_VERTEX}
              fragmentShader={DISK_FRAGMENT}
              transparent
              depthWrite={false}
              side={THREE.DoubleSide}
              blending={THREE.AdditiveBlending}
              toneMapped={true}
            />
          </mesh>
        </group>
      ))}
    </group>
  );
}
