import * as THREE from 'three';

export interface DeepStarfieldData {
  positions: Float32Array;
  colors: Float32Array;
  sizes: Float32Array;
  alphas: Float32Array;
  phases: Float32Array;
}

export const DEEP_STARFIELD = {
  count: 6000,
  innerRadius: 14000,
  depth: 6000,
} as const;

const PALETTE = ['#f8fbff', '#dbe8f8', '#f6e8cd', '#c7d8ec', '#ffffff'];

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

/** Sparse, color-varied deep-space stars on a distant shell. */
export function buildDeepStarfieldData(
  count: number,
  innerRadius: number,
  depth: number,
): DeepStarfieldData {
  const random = mulberry32(730201);
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const sizes = new Float32Array(count);
  const alphas = new Float32Array(count);
  const phases = new Float32Array(count);
  const palette = PALETTE.map((value) => new THREE.Color(value));

  for (let index = 0; index < count; index += 1) {
    const azimuth = random() * Math.PI * 2;
    const elevation = Math.acos(2 * random() - 1);
    const radius = innerRadius + random() * depth;
    positions[index * 3] = Math.sin(elevation) * Math.cos(azimuth) * radius;
    positions[index * 3 + 1] = Math.cos(elevation) * radius;
    positions[index * 3 + 2] = Math.sin(elevation) * Math.sin(azimuth) * radius;

    const color = palette[Math.floor(random() * palette.length)];
    const brightness = 0.55 + random() * 0.45;
    colors[index * 3] = color.r * brightness;
    colors[index * 3 + 1] = color.g * brightness;
    colors[index * 3 + 2] = color.b * brightness;

    sizes[index] = random() > 0.985 ? 1.2 + random() * 1.2 : 0.3 + random() * 0.9;
    alphas[index] = 0.28 + random() * 0.62;
    phases[index] = random();
  }

  return { positions, colors, sizes, alphas, phases };
}
