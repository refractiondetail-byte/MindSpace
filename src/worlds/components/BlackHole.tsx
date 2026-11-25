import { useEffect, useMemo, useRef, useState } from 'react';
import { Html } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

const BLACK_HOLE_RADIUS = 9.0;

const VERTEX = /* glsl */ `
  precision highp float;

  varying vec3 vWorldPosition;
  varying vec3 vNormal;

  void main() {
    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    vWorldPosition = worldPos.xyz;
    vNormal = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * viewMatrix * worldPos;
  }
`;

const FRAGMENT = /* glsl */ `
  precision highp float;

  uniform float uTime;
  uniform vec3 uCameraPosition;
  uniform float uArchIntensity;
  uniform float uRingBrightness;
  varying vec3 vWorldPosition;
  varying vec3 vNormal;

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
    for (int i = 0; i < 4; i += 1) {
      value += amplitude * vnoise(p);
      p *= 2.03;
      amplitude *= 0.5;
    }
    return value;
  }

  void main() {
    const float R = 9.0;
    const float RV = 5.0;
    const float EPS = 0.0001;

    vec3 center = vec3(0.0);
    vec3 dir = vWorldPosition - uCameraPosition;
    float dirLen = length(dir);
    vec3 rd = dir / max(dirLen, EPS);
    vec3 oc = uCameraPosition - center;
    float b = dot(rd, oc);
    float c = dot(oc, oc) - R * R;
    float disc = b * b - c;

    if (disc < 0.0) {
      gl_FragColor = vec4(0.0, 0.0, 0.0, 0.0);
      return;
    }

    float sqrtDisc = sqrt(max(disc, 0.0));
    float tNear = -b - sqrtDisc;
    float tFar = -b + sqrtDisc;
    if (tNear < 0.0) tNear = 0.0;
    if (tFar < tNear) tFar = tNear;

    vec3 ro = uCameraPosition + rd * tNear;
    float maxDist = max(tFar - tNear, EPS);

    vec3 diskNormal = vec3(0.0, 1.0, 0.0);

    vec3 color = vec3(0.0);
    float alpha = 0.0;
    float t = 0.0;
    const int STEPS = 80;
    const float STEP = 0.225;

    for (int i = 0; i < STEPS; i++) {
      if (t > maxDist) break;
      vec3 p = ro + rd * t;
      float r = length(p);

      if (r < R) {
        // Event horizon core: pitch-black, light-trapping void.
        if (r < 1.8) {
          color = vec3(0.0);
          alpha = 1.0;
          break;
        }

        float volumeFade = 1.0 - smoothstep(RV * 0.78, RV, r);
        float edgeFade = 1.0 - smoothstep(R * 0.92, R, r);

        float h = dot(p, diskNormal);
        vec3 radialVec = p - diskNormal * h;
        float rho = length(radialVec);
        float ang = atan(radialVec.z, radialVec.x);

        float diskThickness = 0.16 + 0.08 * rho;
        float inDisk = 1.0 - smoothstep(0.0, diskThickness, abs(h));

        float speed = 3.6 / (rho + 0.25);
        float spiral = ang + uTime * speed + rho * 4.0;
        vec2 spiralCoord = vec2(cos(spiral), sin(spiral)) * (4.0 + rho * 2.2);
        float noise = fbm(spiralCoord + vec2(uTime * 0.22, -uTime * 0.16));
        float filament = smoothstep(0.35, 0.72, noise);
        float diskDensity = inDisk * filament *
          smoothstep(1.8, 2.2, rho) * (1.0 - smoothstep(5.2, 6.5, rho));

        float doppler = 0.55 + 0.45 * (0.5 + 0.5 * cos(ang - 1.4));
        diskDensity *= doppler;

        float dustNoise = fbm(spiralCoord * 1.7 - vec2(uTime * 0.10, uTime * 0.07));
        float dust = 1.0 - smoothstep(0.18, 0.50, dustNoise);
        diskDensity *= (0.30 + 0.70 * dust);

        float lensBand = smoothstep(2.0, 2.4, r) * (1.0 - smoothstep(6.0, 7.2, r));
        float archTop = exp(-pow(abs((h - (0.95 * (1.0 - rho / 6.5))) / 0.16), 2.0));
        float archBottom = exp(-pow(abs((h + (0.55 * (1.0 - rho / 6.5))) / 0.16), 2.0));
        float arches = lensBand * (archTop * 1.35 + archBottom * 0.85) *
          (0.6 + 0.4 * sin(ang * 4.0 + uTime * 2.0));

        float wispNoise = fbm(p.xz * 1.6 + p.y * 0.7 + uTime * 0.18);
        float wisps = smoothstep(0.42, 0.72, wispNoise) *
          smoothstep(2.0, 2.6, r) * (1.0 - smoothstep(6.0, 7.5, r)) * 0.45;

        // Tight, crisp rim just outside the event horizon.
        float rim = smoothstep(1.8, 2.0, r) * (1.0 - smoothstep(2.0, 2.35, r));
        rim *= 0.72 + 0.28 * (0.5 + 0.5 * sin(ang * 6.0 + uTime * 2.5));

        float density = (diskDensity * 0.92 + arches * 1.25 * uArchIntensity + rim * 2.6 * uRingBrightness) * edgeFade;
        density = max(density, 0.0);

        vec3 deepOrange = vec3(0.28, 0.08, 0.015);
        vec3 amber = vec3(0.82, 0.36, 0.07);
        vec3 gold = vec3(1.0, 0.66, 0.14);
        vec3 hot = vec3(1.0, 0.92, 0.72);

        float radialT = clamp((rho - 1.8) / (6.5 - 1.8), 0.0, 1.0);
        vec3 diskColor = mix(hot, amber, smoothstep(0.0, 0.45, radialT));
        diskColor = mix(diskColor, vec3(0.55, 0.12, 0.02), smoothstep(0.45, 1.0, radialT));
        vec3 sampleColor = mix(diskColor, gold, clamp(diskDensity * 1.1, 0.0, 1.0) * 0.35);
        sampleColor = mix(sampleColor, vec3(1.0, 0.95, 0.8), clamp(arches * 1.1 * uArchIntensity, 0.0, 1.0));
        sampleColor = mix(sampleColor, hot, clamp(rim * 1.8, 0.0, 1.0));

        float stepAlpha = 1.0 - exp(-density * STEP * 7.0);
        color += (1.0 - alpha) * sampleColor * stepAlpha;
        alpha += (1.0 - alpha) * stepAlpha;

        if (alpha > 0.985) {
          alpha = 1.0;
          break;
        }
      }

      t += STEP;
    }

    gl_FragColor = vec4(color, clamp(alpha, 0.0, 1.0));
  }
`;

interface BlackHoleProps {
  onSelect?: () => void;
}

export function BlackHole({ onSelect }: BlackHoleProps = {}) {
  const materialRef = useRef<any>(null);
  const meshRef = useRef<THREE.Mesh | null>(null);
  const timeRef = useRef(0);
  const loggedRef = useRef(false);
  const [hovered, setHovered] = useState(false);

  const particleData = useRef<{ radii: Float32Array; angles: Float32Array; heights: Float32Array } | null>(null);
  const particleGeometry = useMemo(() => {
    const count = 150;
    const positions = new Float32Array(count * 3);
    const radii = new Float32Array(count);
    const angles = new Float32Array(count);
    const heights = new Float32Array(count);
    let seed = 12345;
    const rand = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    for (let i = 0; i < count; i += 1) {
      const r = 2.5 + rand() * 6.5;
      const a = rand() * Math.PI * 2;
      const h = (rand() - 0.5) * 0.7 * (1 - (r - 2.5) / 6.5);
      radii[i] = r;
      angles[i] = a;
      heights[i] = h;
      positions[i * 3] = r * Math.cos(a);
      positions[i * 3 + 1] = h;
      positions[i * 3 + 2] = r * Math.sin(a);
    }
    particleData.current = { radii, angles, heights };
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    return geometry;
  }, []);

  useEffect(() => () => particleGeometry.dispose(), [particleGeometry]);

  const uniforms = useRef({
    uTime: { value: 0 },
    uCameraPosition: { value: new THREE.Vector3() },
    uArchIntensity: { value: 1.25 },
    uRingBrightness: { value: 1.15 },
  }).current;

  useEffect(() => {
    console.info('[BlackHole] mounted at origin with scale 1');
    return () => console.info('[BlackHole] unmounted');
  }, []);

  useFrame((state, delta) => {
    timeRef.current += delta;
    const shader = materialRef.current;
    if (!shader) return;
    shader.uniforms.uTime.value = timeRef.current;
    shader.uniforms.uCameraPosition.value.copy(state.camera.position);

    const data = particleData.current;
    const positionAttr = particleGeometry.getAttribute('position') as THREE.BufferAttribute | undefined;
    if (data && positionAttr) {
      for (let i = 0; i < data.radii.length; i += 1) {
        const r = data.radii[i];
        const speed = 0.9 / Math.pow(r, 1.15);
        data.angles[i] += delta * speed;
        const a = data.angles[i];
        positionAttr.setXYZ(i, r * Math.cos(a), data.heights[i], r * Math.sin(a));
      }
      positionAttr.needsUpdate = true;
    }

    // Render only the side facing the camera to avoid double volume passes.
    const isInside = state.camera.position.length() < BLACK_HOLE_RADIUS;
    shader.side = isInside ? THREE.BackSide : THREE.FrontSide;

    if (!loggedRef.current) {
      loggedRef.current = true;
      console.info('[BlackHole] material ready', {
        hasProgram: Boolean(shader.program),
        meshScale: meshRef.current?.scale.toArray() ?? null,
        meshPosition: meshRef.current?.position.toArray() ?? null,
        cameraPosition: state.camera.position.toArray(),
      });
    }
  });

  const NO_RAYCAST = () => null;

  return (
    <group rotation={[0.28, 0.18, 0]}>
      <mesh
        ref={(el) => {
          meshRef.current = el;
        }}
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
        <sphereGeometry args={[BLACK_HOLE_RADIUS, 64, 48]} />
        <shaderMaterial
          ref={(el) => {
            materialRef.current = el;
          }}
          uniforms={uniforms}
          vertexShader={VERTEX}
          fragmentShader={FRAGMENT}
          transparent
          depthWrite={false}
          side={THREE.DoubleSide}
          blending={THREE.NormalBlending}
          toneMapped={false}
        />
      </mesh>
      {/* Orbiting particles: faster closer in, slower farther out. */}
      <points geometry={particleGeometry} raycast={NO_RAYCAST} renderOrder={3}>
        <pointsMaterial
          color="#ffd7a8"
          size={0.09}
          transparent
          opacity={0.72}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          sizeAttenuation
          toneMapped={false}
        />
      </points>

      {/* Pitch-black event horizon rendered in front of the accretion volume. */}
      <mesh raycast={NO_RAYCAST} renderOrder={2}>
        <sphereGeometry args={[1.8, 64, 64]} />
        <meshBasicMaterial
          color="#000000"
          transparent
          opacity={1}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>
      {hovered && (
        <Html position={[0, 3.0, 0]} center zIndexRange={[60, 0]} style={{ pointerEvents: 'none' }}>
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
