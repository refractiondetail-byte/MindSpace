import { useEffect, useMemo } from 'react';
import { Billboard } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

/**
 * A large, dense spiral galaxy: ~200k stars, nebula clouds, dark dust lanes,
 * a diffuse disk glow and a bright central bulge. Built for a "zoomed all the
 * way out" view where individual stars dissolve into a continuous glow, while
 * still having real 3D stars to fly past when the camera dives in.
 */

export const MILKY_WAY = {
  /** Outer radius of the stellar disk in world units. */
  radius: 900,
  /** Radius where the spiral arms start. */
  core: 60,
  arms: 4,
  /** Logarithmic spiral pitch: smaller = more tightly wound. */
  pitch: 0.3,
} as const;

/** Angle of a spiral arm's centreline at radius `r`. */
export function milkyWayArmAngle(r: number, arm: number): number {
  return (
    (arm * Math.PI * 2) / MILKY_WAY.arms +
    Math.log(Math.max(r, MILKY_WAY.core) / MILKY_WAY.core) / MILKY_WAY.pitch
  );
}

/** A point on spiral arm `arm` at fraction `t` (0 = core, 1 = rim). */
export function milkyWayArmPoint(t: number, arm: number, height = 0): [number, number, number] {
  const r = MILKY_WAY.core + t * (MILKY_WAY.radius - MILKY_WAY.core);
  const angle = milkyWayArmAngle(r, arm);
  return [Math.cos(angle) * r, height, Math.sin(angle) * r];
}

function mulberry32(seed: number): () => number {
  let state = seed;
  return () => {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function gaussian(random: () => number): number {
  const u = Math.max(random(), 1e-9);
  const v = random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(Math.PI * 2 * v);
}

function pick<T>(random: () => number, list: readonly T[]): T {
  return list[Math.floor(random() * list.length)];
}

/* ------------------------------------------------------------------ stars */

const STAR_VERTEX = /* glsl */ `
  uniform float uPixelScale;
  uniform float uDpr;
  uniform float uBrightness;
  attribute vec3 aColor;
  attribute float aSize;
  varying vec3 vColor;
  varying float vAlpha;

  void main() {
    vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * viewPosition;
    float dist = max(-viewPosition.z, 0.001);

    // Projected diameter in pixels. Stars smaller than a pixel keep a minimum
    // footprint but lose energy with the square of the shrink, so from far
    // away millions of unresolved stars add up to a smooth galactic glow.
    float px = aSize * uPixelScale / dist;
    float minPx = 1.6 * uDpr;
    float energy = 1.0;
    if (px < minPx) {
      energy = max((px * px) / (minPx * minPx), 0.012);
      px = minPx;
    }
    // Tighter cap than before: a star that skims the lens is already faded
    // out by nearFade, so a smaller ceiling only removes wasted fill rate.
    px = min(px, 7.0 * uDpr);

    // Don't let a star balloon into a blob when the camera skims past it.
    float nearFade = smoothstep(0.4, 3.0, dist);

    gl_PointSize = px;
    vColor = aColor;
    vAlpha = energy * nearFade * uBrightness;
  }
`;

const STAR_FRAGMENT = /* glsl */ `
  varying vec3 vColor;
  varying float vAlpha;

  void main() {
    float d = length(gl_PointCoord - 0.5) * 2.0;
    if (d > 1.0) discard;
    float core = exp(-d * d * 7.0);
    gl_FragColor = vec4(vColor * (0.8 + core * 0.6), core * vAlpha);
  }
`;

const BULGE_COLORS = ['#ffd9a3', '#ffe6c4', '#ffc98c', '#fff1dc'];
const ARM_COLORS = ['#cfe0ff', '#b4caff', '#ffffff', '#fff3df', '#dfe9ff', '#a8bfff'];
const DISK_COLORS = ['#fff4e0', '#ffe2b8', '#f3f6ff', '#ffd7a6'];

export function buildMilkyWayStars(count: number): THREE.BufferGeometry {
  const random = mulberry32(1337421);
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const sizes = new Float32Array(count);
  const color = new THREE.Color();

  for (let i = 0; i < count; i += 1) {
    const roll = random();
    let x: number;
    let y: number;
    let z: number;
    let brightness = 0.55 + random() * 0.45;

    if (roll < 0.2) {
      // Bulge: dense, warm, slightly flattened ellipsoid.
      const r = -Math.log(Math.max(random(), 1e-6)) * 75;
      const theta = random() * Math.PI * 2;
      const cosPhi = 2 * random() - 1;
      const sinPhi = Math.sqrt(1 - cosPhi * cosPhi);
      x = r * sinPhi * Math.cos(theta);
      y = r * cosPhi * 0.42;
      z = r * sinPhi * Math.sin(theta);
      color.set(pick(random, BULGE_COLORS));
      brightness *= 1.1;
    } else if (roll < 0.82) {
      // Spiral arms: young blue-white stars tracing the log spirals.
      const arm = Math.floor(random() * MILKY_WAY.arms);
      const t = Math.pow(random(), 0.85);
      const r0 = MILKY_WAY.core + t * (MILKY_WAY.radius - MILKY_WAY.core);
      const spread = 14 + r0 * 0.075;
      const r = r0 + gaussian(random) * spread * 0.6;
      const angle = milkyWayArmAngle(r0, arm) + (gaussian(random) * spread) / Math.max(r0, 1);
      x = Math.cos(angle) * r;
      z = Math.sin(angle) * r;
      y = gaussian(random) * (4 + 9 * (1 - t));
      color.set(pick(random, ARM_COLORS));
      if (random() < 0.03) color.set('#ffb0c4');
      brightness *= 1.05 - 0.35 * t;
    } else {
      // Thin old disk filling the gaps between arms.
      const r = Math.min(-Math.log(Math.max(random(), 1e-6)) * 280, MILKY_WAY.radius * 1.1);
      const angle = random() * Math.PI * 2;
      x = Math.cos(angle) * r;
      z = Math.sin(angle) * r;
      y = gaussian(random) * 10;
      color.set(pick(random, DISK_COLORS));
      brightness *= 0.75;
    }

    positions[i * 3] = x;
    positions[i * 3 + 1] = y;
    positions[i * 3 + 2] = z;

    const giant = random() < 0.018;
    sizes[i] = giant ? 1.8 + random() * 2.4 : 0.45 + random() * 0.75;
    if (giant) brightness = Math.min(1.3, brightness * 1.4);

    colors[i * 3] = color.r * brightness;
    colors[i * 3 + 1] = color.g * brightness;
    colors[i * 3 + 2] = color.b * brightness;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('aColor', new THREE.BufferAttribute(colors, 3));
  geometry.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
  geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), MILKY_WAY.radius * 1.2);
  return geometry;
}

/* --------------------------------------------------------- clouds & dust */

const CLOUD_VERTEX = /* glsl */ `
  uniform float uPixelScale;
  uniform float uDpr;
  attribute vec3 aColor;
  attribute float aSize;
  attribute float aAlpha;
  attribute float aSeed;
  varying vec3 vColor;
  varying float vAlpha;
  varying float vSeed;

  void main() {
    vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * viewPosition;
    float dist = max(-viewPosition.z, 0.001);
    float px = aSize * uPixelScale / dist;

    // Fade clouds out as the camera enters them, and cap their screen size.
    // The cap is deliberately modest (a 282k-pixel quad of 4-octave noise per
    // cloud is what made close fly-throughs crawl) and, crucially, a cloud
    // fades all the way to zero just past it instead of sitting clamped at
    // 35% as a screen-filling additive slab. Cloud sprites at the resting
    // zoom are far below the cap, so the wide shot is untouched.
    float nearFade = smoothstep(aSize * 0.5, aSize * 2.2, dist);
    float capPx = 160.0 * uDpr;
    float capFade = 1.0 - smoothstep(capPx, capPx * 2.4, px);

    gl_PointSize = clamp(px, 1.0, capPx);
    vColor = aColor;
    vAlpha = aAlpha * nearFade * capFade;
    vSeed = aSeed;
  }
`;

const CLOUD_FRAGMENT = /* glsl */ `
  varying vec3 vColor;
  varying float vAlpha;
  varying float vSeed;

  float hash(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }

  float vnoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
      mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
      u.y);
  }

  float fbm(vec2 p) {
    float value = 0.0;
    float amplitude = 0.5;
    for (int i = 0; i < 4; i += 1) {
      value += amplitude * vnoise(p);
      p *= 2.1;
      amplitude *= 0.5;
    }
    return value;
  }

  void main() {
    vec2 p = gl_PointCoord - 0.5;
    float d = length(p) * 2.0;
    if (d > 1.0 || vAlpha <= 0.001) discard;
    // Wispy, irregular cloud: noise eats into a soft radial falloff.
    float n = fbm(p * 3.2 + vSeed * 37.0);
    float falloff = 1.0 - smoothstep(0.0, 1.0, d);
    float shape = smoothstep(0.15, 0.85, falloff * 0.9 + (n - 0.5) * 0.9) * falloff;
    gl_FragColor = vec4(vColor, shape * vAlpha);
  }
`;

/*
 * Depth-only twin of a cloud sprite. It runs after the visible clouds and
 * before the warp trails, writing the cloud's depth without touching colour,
 * so streaks from stars the cloud is hiding get depth-tested away. Coverage
 * follows the sprite's own alpha falloff and fades with it, so a cloud that
 * has faded out (camera entering it, or the size cap) stops occluding too.
 */
const OCCLUDER_FRAGMENT = /* glsl */ `
  uniform float uThreshold;
  varying float vAlpha;

  void main() {
    vec2 p = gl_PointCoord - 0.5;
    float d = length(p) * 2.0;
    if (d > 1.0) discard;
    float falloff = 1.0 - smoothstep(0.0, 1.0, d);
    if (falloff * vAlpha < uThreshold) discard;
  }
`;

const NEBULA_PINK = ['#ff5b7f', '#ff7a9c', '#e8507a'];
const NEBULA_BLUE = ['#6f8cff', '#8fb0ff', '#7a7dff'];
const NEBULA_WARM = ['#ffb27a', '#ff9e6a', '#ffcf9a'];

interface CloudBuffers {
  positions: number[];
  colors: number[];
  sizes: number[];
  alphas: number[];
  seeds: number[];
}

function cloudGeometry(buffers: CloudBuffers) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(buffers.positions, 3));
  geometry.setAttribute('aColor', new THREE.Float32BufferAttribute(buffers.colors, 3));
  geometry.setAttribute('aSize', new THREE.Float32BufferAttribute(buffers.sizes, 1));
  geometry.setAttribute('aAlpha', new THREE.Float32BufferAttribute(buffers.alphas, 1));
  geometry.setAttribute('aSeed', new THREE.Float32BufferAttribute(buffers.seeds, 1));
  geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), MILKY_WAY.radius * 1.3);
  return geometry;
}

function emptyBuffers(): CloudBuffers {
  return { positions: [], colors: [], sizes: [], alphas: [], seeds: [] };
}

function buildNebulae(count: number) {
  const random = mulberry32(88112);
  const out = emptyBuffers();
  const color = new THREE.Color();

  for (let i = 0; i < count; i += 1) {
    const inCore = i < count * 0.08;
    let x: number;
    let y: number;
    let z: number;
    let size: number;
    let alpha: number;

    if (inCore) {
      const r = Math.abs(gaussian(random)) * 90;
      const angle = random() * Math.PI * 2;
      x = Math.cos(angle) * r;
      z = Math.sin(angle) * r;
      y = gaussian(random) * 18;
      size = 90 + random() * 160;
      alpha = 0.04 + random() * 0.05;
      color.set(pick(random, NEBULA_WARM));
    } else {
      const arm = Math.floor(random() * MILKY_WAY.arms);
      const t = 0.06 + Math.pow(random(), 0.9) * 0.9;
      const r0 = MILKY_WAY.core + t * (MILKY_WAY.radius - MILKY_WAY.core);
      const spread = 10 + r0 * 0.05;
      const r = r0 + gaussian(random) * spread * 0.5;
      const angle = milkyWayArmAngle(r0, arm) + (gaussian(random) * spread) / r0;
      x = Math.cos(angle) * r;
      z = Math.sin(angle) * r;
      y = gaussian(random) * 4;
      size = 22 + random() * 70;
      alpha = 0.05 + random() * 0.1;
      const kind = random();
      color.set(
        kind < 0.45 ? pick(random, NEBULA_PINK) : kind < 0.8 ? pick(random, NEBULA_BLUE) : pick(random, NEBULA_WARM),
      );
    }

    out.positions.push(x, y, z);
    out.colors.push(color.r, color.g, color.b);
    out.sizes.push(size);
    out.alphas.push(alpha);
    out.seeds.push(random());
  }
  return cloudGeometry(out);
}

function buildDust(count: number) {
  const random = mulberry32(5550123);
  const out = emptyBuffers();

  for (let i = 0; i < count; i += 1) {
    const arm = Math.floor(random() * MILKY_WAY.arms);
    const t = 0.03 + Math.pow(random(), 0.8) * 0.85;
    const r0 = MILKY_WAY.core + t * (MILKY_WAY.radius - MILKY_WAY.core);
    const spread = 6 + r0 * 0.03;
    // Dust lanes hug the inner (concave) edge of each arm.
    const r = r0 - (10 + r0 * 0.045) + gaussian(random) * spread;
    const angle = milkyWayArmAngle(r0, arm) + (gaussian(random) * spread * 0.8) / r0;
    out.positions.push(Math.cos(angle) * r, gaussian(random) * 2.2, Math.sin(angle) * r);
    const tone = 0.03 + random() * 0.03;
    out.colors.push(tone * 1.4, tone, tone * 0.7);
    out.sizes.push(18 + random() * 50);
    out.alphas.push(0.22 + random() * 0.3);
    out.seeds.push(random());
  }
  return cloudGeometry(out);
}

/* ------------------------------------------------------------- diffuse glow */

const DISK_GLOW_VERTEX = /* glsl */ `
  varying vec2 vPlane;
  void main() {
    vPlane = position.xy;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const DISK_GLOW_FRAGMENT = /* glsl */ `
  uniform float uRadius;
  uniform float uCore;
  uniform float uPitch;
  uniform float uIntensity;
  varying vec2 vPlane;

  void main() {
    // The plane is rotated flat, so local xy maps to world xz.
    float r = length(vPlane);
    if (r > uRadius * 1.1) discard;
    float angle = atan(-vPlane.y, vPlane.x);
    float phase = angle - log(max(r, uCore) / uCore) / uPitch;
    // x^3 written as two multiplies: no reason to pay for pow() per pixel.
    float armWave = 0.5 + 0.5 * cos(4.0 * phase);
    float arms = armWave * armWave * armWave;
    float armMask = smoothstep(uCore * 0.6, uCore * 2.0, r);
    float density = exp(-r / 300.0) * (0.35 + 0.65 * mix(1.0, arms, armMask));
    density *= 1.0 - smoothstep(uRadius * 0.7, uRadius * 1.1, r);
    // This plane covers the whole disk, so when the camera is inside it the
    // invisible outer fringe would still blend every pixel. Skip it instead.
    if (density * uIntensity < 0.002) discard;
    vec3 warm = vec3(1.0, 0.82, 0.6);
    vec3 cool = vec3(0.62, 0.72, 1.0);
    vec3 color = mix(warm, cool, smoothstep(80.0, 500.0, r) * arms);
    gl_FragColor = vec4(color, density * uIntensity);
  }
`;

const BULGE_VERTEX = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const BULGE_FRAGMENT = /* glsl */ `
  uniform float uIntensity;
  varying vec2 vUv;
  void main() {
    float d = length(vUv - 0.5) * 2.0;
    if (d > 1.0) discard;
    float glow = exp(-d * d * 14.0) * 0.8 + exp(-d * 4.5) * 0.22;
    glow *= 1.0 - smoothstep(0.75, 1.0, d);
    vec3 color = mix(vec3(1.0, 0.93, 0.8), vec3(1.0, 0.7, 0.42), smoothstep(0.0, 0.6, d));
    gl_FragColor = vec4(color, glow * uIntensity);
  }
`;

/* -------------------------------------------------------------- component */

interface MilkyWayProps {
  starCount?: number;
  /** Prebuilt star points, shared with the warp-trail effect so trails start on real stars. */
  stars?: THREE.BufferGeometry;
}

export function MilkyWay({ starCount = 200000, stars }: MilkyWayProps) {
  const fallbackStars = useMemo(
    () => (stars ? null : buildMilkyWayStars(starCount)),
    [stars, starCount],
  );
  const starGeometry = stars ?? (fallbackStars as THREE.BufferGeometry);
  const nebulae = useMemo(() => buildNebulae(2400), []);
  const dust = useMemo(() => buildDust(2800), []);

  const starMaterial = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: {
          uPixelScale: { value: 700 },
          uDpr: { value: 1 },
          uBrightness: { value: 1.0 },
        },
        vertexShader: STAR_VERTEX,
        fragmentShader: STAR_FRAGMENT,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    [],
  );

  const nebulaMaterial = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: { uPixelScale: { value: 700 }, uDpr: { value: 1 } },
        vertexShader: CLOUD_VERTEX,
        fragmentShader: CLOUD_FRAGMENT,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    [],
  );

  const dustMaterial = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: { uPixelScale: { value: 700 }, uDpr: { value: 1 } },
        vertexShader: CLOUD_VERTEX,
        fragmentShader: CLOUD_FRAGMENT,
        transparent: true,
        depthWrite: false,
        blending: THREE.NormalBlending,
      }),
    [],
  );

  const nebulaOccluderMaterial = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: {
          uPixelScale: { value: 700 },
          uDpr: { value: 1 },
          // A glowing nebula hides stars in its bright core only.
          uThreshold: { value: 0.03 },
        },
        vertexShader: CLOUD_VERTEX,
        fragmentShader: OCCLUDER_FRAGMENT,
        transparent: true,
        depthWrite: true,
        colorWrite: false,
      }),
    [],
  );

  const dustOccluderMaterial = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: {
          uPixelScale: { value: 700 },
          uDpr: { value: 1 },
          // Dark dust lanes block almost the whole sprite.
          uThreshold: { value: 0.09 },
        },
        vertexShader: CLOUD_VERTEX,
        fragmentShader: OCCLUDER_FRAGMENT,
        transparent: true,
        depthWrite: true,
        colorWrite: false,
      }),
    [],
  );

  const diskGlowMaterial = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: {
          uRadius: { value: MILKY_WAY.radius },
          uCore: { value: MILKY_WAY.core },
          uPitch: { value: MILKY_WAY.pitch },
          uIntensity: { value: 0.16 },
        },
        vertexShader: DISK_GLOW_VERTEX,
        fragmentShader: DISK_GLOW_FRAGMENT,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
      }),
    [],
  );

  const bulgeMaterial = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: { uIntensity: { value: 0.75 } },
        vertexShader: BULGE_VERTEX,
        fragmentShader: BULGE_FRAGMENT,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    [],
  );

  useEffect(
    () => () => {
      starGeometry.dispose();
      nebulae.dispose();
      dust.dispose();
      starMaterial.dispose();
      nebulaMaterial.dispose();
      dustMaterial.dispose();
      nebulaOccluderMaterial.dispose();
      dustOccluderMaterial.dispose();
      diskGlowMaterial.dispose();
      bulgeMaterial.dispose();
    },
    [
      starGeometry,
      nebulae,
      dust,
      starMaterial,
      nebulaMaterial,
      dustMaterial,
      nebulaOccluderMaterial,
      dustOccluderMaterial,
      diskGlowMaterial,
      bulgeMaterial,
    ],
  );

  // Hoisted so the per-frame uniform pass allocates nothing.
  const pixelMaterials = useMemo(
    () => [starMaterial, nebulaMaterial, dustMaterial, nebulaOccluderMaterial, dustOccluderMaterial],
    [starMaterial, nebulaMaterial, dustMaterial, nebulaOccluderMaterial, dustOccluderMaterial],
  );

  useFrame((state) => {
    const camera = state.camera as THREE.PerspectiveCamera;
    const dpr = state.viewport.dpr;
    const pixelScale = (state.size.height * dpr) / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2));
    for (let i = 0; i < pixelMaterials.length; i += 1) {
      const material = pixelMaterials[i];
      material.uniforms.uPixelScale.value = pixelScale;
      material.uniforms.uDpr.value = dpr;
    }
  });

  const NO_RAYCAST = () => null;

  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} renderOrder={-3} raycast={NO_RAYCAST} material={diskGlowMaterial}>
        <circleGeometry args={[MILKY_WAY.radius * 1.1, 128]} />
      </mesh>
      <Billboard renderOrder={-2}>
        <mesh renderOrder={-2} raycast={NO_RAYCAST} material={bulgeMaterial}>
          <planeGeometry args={[520, 520]} />
        </mesh>
      </Billboard>
      <points geometry={starGeometry} material={starMaterial} renderOrder={-1} raycast={NO_RAYCAST} />
      <points geometry={nebulae} material={nebulaMaterial} renderOrder={0} raycast={NO_RAYCAST} />
      <points geometry={dust} material={dustMaterial} renderOrder={0} raycast={NO_RAYCAST} />
      {/* Depth-only pass after the visible clouds and before the warp trails
          (renderOrder 9): clouds hide the star streaks behind them. */}
      <points geometry={nebulae} material={nebulaOccluderMaterial} renderOrder={5} raycast={NO_RAYCAST} />
      <points geometry={dust} material={dustOccluderMaterial} renderOrder={5} raycast={NO_RAYCAST} />
    </group>
  );
}
