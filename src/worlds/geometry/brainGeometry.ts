import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { BRAIN_RADII, type Vec3 } from '../layout';

/**
 * Procedural anatomical brain. The cortex is a smooth translucent shell with a
 * longitudinal fissure and temporal bulges; the folds themselves are hundreds
 * of winding tube "gyri" merged into a single geometry, so the surface reads as
 * organic noodles rather than a triangulated cage. The cerebellum gets its own
 * foliated ellipsoid with parallel ridges.
 */

function hash3(x: number, y: number, z: number): number {
  let h =
    Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(z, 2147483647);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

function smooth(t: number): number {
  return t * t * (3 - 2 * t);
}

function valueNoise(x: number, y: number, z: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const zi = Math.floor(z);
  const u = smooth(x - xi);
  const v = smooth(y - yi);
  const w = smooth(z - zi);

  const lerp = THREE.MathUtils.lerp;
  const c000 = hash3(xi, yi, zi);
  const c100 = hash3(xi + 1, yi, zi);
  const c010 = hash3(xi, yi + 1, zi);
  const c110 = hash3(xi + 1, yi + 1, zi);
  const c001 = hash3(xi, yi, zi + 1);
  const c101 = hash3(xi + 1, yi, zi + 1);
  const c011 = hash3(xi, yi + 1, zi + 1);
  const c111 = hash3(xi + 1, yi + 1, zi + 1);

  return lerp(
    lerp(lerp(c000, c100, u), lerp(c010, c110, u), v),
    lerp(lerp(c001, c101, u), lerp(c011, c111, u), v),
    w,
  );
}

function fbm(x: number, y: number, z: number, octaves = 2): number {
  let sum = 0;
  let amplitude = 0.5;
  let frequency = 1;
  for (let octave = 0; octave < octaves; octave += 1) {
    sum += valueNoise(x * frequency, y * frequency, z * frequency) * amplitude;
    amplitude *= 0.5;
    frequency *= 2.05;
  }
  return sum;
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

const CEREBELLUM_CENTER: Vec3 = [0, -10, -14.5];
const CEREBELLUM_RADII: Vec3 = [10.5, 6.4, 8.6];

/** Twin-hemisphere cerebrum with a deep midline cleft and temporal lobes. */
export function createCerebrumGeometry(
  widthSegments = 144,
  heightSegments = 96,
): THREE.BufferGeometry {
  const geometry = new THREE.SphereGeometry(1, widthSegments, heightSegments);
  const position = geometry.attributes.position;
  const direction = new THREE.Vector3();
  const [rx, ry, rz] = BRAIN_RADII;

  for (let index = 0; index < position.count; index += 1) {
    direction.fromBufferAttribute(position, index).normalize();

    // Narrow the frontal pole and swell the temporal lobes.
    const frontalTaper =
      1 -
      0.12 *
        smooth(THREE.MathUtils.clamp((direction.z - 0.28) / 0.72, 0, 1));
    const temporal =
      1 +
      0.14 *
        THREE.MathUtils.clamp(-direction.y, 0, 1) *
        (1 - Math.abs(direction.z) * 0.3);

    const lump = 1 + (fbm(direction.x * 2.4 + 3.1, direction.y * 2.4, direction.z * 2.4, 2) - 0.5) * 0.04;

    // Longitudinal fissure: an inward crease along the whole midline crown.
    const midline = Math.exp(-((direction.x / 0.12) ** 2));
    const crown = smooth(
      THREE.MathUtils.clamp((direction.y + 0.48) / 0.72, 0, 1),
    );
    const fissure = 1 - 0.115 * midline * crown;

    // Shallow Sylvian cleft separating the temporal lobe.
    const sylvianBand =
      Math.exp(
        -(((direction.y - (0.02 - 0.22 * direction.z)) / 0.075) ** 2),
      ) *
      THREE.MathUtils.clamp(Math.abs(direction.x) * 1.8, 0, 1) *
      (1 - THREE.MathUtils.clamp((direction.z - 0.2) / 0.8, 0, 1));
    const sylvian = 1 - 0.05 * sylvianBand;

    // A flatter cranial base.
    const underside =
      1 -
      0.09 *
        smooth(THREE.MathUtils.clamp((-direction.y - 0.5) / 0.5, 0, 1));

    const scale = lump * fissure * sylvian * underside;
    position.setXYZ(
      index,
      direction.x * rx * temporal * frontalTaper * scale,
      direction.y * ry * scale,
      direction.z * rz * scale,
    );
  }

  position.needsUpdate = true;
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

/** Foliated cerebellum tucked under the occipital lobes. */
export function createCerebellumGeometry(): THREE.BufferGeometry {
  const geometry = new THREE.SphereGeometry(1, 80, 52);
  const position = geometry.attributes.position;
  const direction = new THREE.Vector3();
  const [rx, ry, rz] = CEREBELLUM_RADII;
  const [cx, cy, cz] = CEREBELLUM_CENTER;

  for (let index = 0; index < position.count; index += 1) {
    direction.fromBufferAttribute(position, index).normalize();
    const qx = direction.x * rx;
    const qy = direction.y * ry;
    const qz = direction.z * rz;

    // Gentle base folia; the crisp ridges come from the tube bands.
    const folia = 1 + 0.018 * Math.sin(direction.y * 16 + fbm(qx * 0.3, qy * 0.3, qz * 0.3, 2) * 2.4);
    const lump = 1 + (fbm(qx * 0.3 + 7, qy * 0.3, qz * 0.3 - 4, 2) - 0.5) * 0.06;

    const scale = folia * lump;
    position.setXYZ(
      index,
      qx * scale + cx,
      qy * scale + cy,
      qz * scale + cz,
    );
  }

  position.needsUpdate = true;
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

/**
 * Winding cortical ridges. Each gyrus starts at a seeded point on one
 * hemisphere and wanders along the surface, bouncing off the midline so the
 * two hemispheres never grow into each other. All tubes merge into one draw
 * call.
 */
export function createGyrusGeometry(): THREE.BufferGeometry {
  const random = mulberry32(0x51ed270b);
  const [rx, ry, rz] = BRAIN_RADII;
  const up = new THREE.Vector3(0, 1, 0);
  const tubes: THREE.BufferGeometry[] = [];

  for (const hemisphere of [-1, 1]) {
    for (let index = 0; index < 30; index += 1) {
      const azimuth = random() * Math.PI * 2;
      const polar = Math.acos(2 * random() - 1);
      const direction = new THREE.Vector3(
        Math.sin(polar) * Math.cos(azimuth),
        Math.cos(polar),
        Math.sin(polar) * Math.sin(azimuth),
      );
      if (direction.x * hemisphere < 0.22) {
        direction.x = hemisphere * 0.22;
        direction.normalize();
      }

      const normal = new THREE.Vector3(
        direction.x / rx,
        direction.y / ry,
        direction.z / rz,
      ).normalize();

      let tangent = new THREE.Vector3().crossVectors(normal, up);
      if (tangent.lengthSq() < 0.01) {
        tangent.set(1, 0, 0).cross(normal);
      }
      tangent.normalize();
      tangent.applyAxisAngle(normal, random() * Math.PI * 2);

      const lift = 0.28 + random() * 0.5;
      const points: THREE.Vector3[] = [];

      for (let step = 0; step < 34; step += 1) {
        const surfaceNormal = new THREE.Vector3(
          direction.x / rx,
          direction.y / ry,
          direction.z / rz,
        ).normalize();

        points.push(
          new THREE.Vector3(
            direction.x * rx,
            direction.y * ry,
            direction.z * rz,
          ).addScaledVector(surfaceNormal, lift),
        );

        // Meander across the cortex with a smoothly varying heading.
        const bend = new THREE.Vector3().crossVectors(surfaceNormal, up);
        if (bend.lengthSq() < 0.01) {
          bend.set(1, 0, 0).cross(surfaceNormal);
        }
        bend.normalize();
        const bendTwo = new THREE.Vector3()
          .crossVectors(surfaceNormal, bend)
          .normalize();

        tangent.addScaledVector(bend, (random() - 0.5) * 1.15);
        tangent.addScaledVector(bendTwo, (random() - 0.5) * 1.15);
        tangent.addScaledVector(surfaceNormal, -tangent.dot(surfaceNormal));
        tangent.normalize();

        direction.addScaledVector(tangent, 0.05).normalize();

        // Stay on this side of the longitudinal fissure.
        if (direction.x * hemisphere < 0.06) {
          direction.x = hemisphere * 0.06;
          direction.normalize();
        }
      }

      const curve = new THREE.CatmullRomCurve3(points, false, 'centripetal', 0.45);
      const radius = 0.42 + random() * 0.5;
      tubes.push(new THREE.TubeGeometry(curve, 46, radius, 6, false));
    }
  }

  const merged = mergeGeometries(tubes, false);
  for (const tube of tubes) tube.dispose();
  if (!merged) return new THREE.BufferGeometry();
  merged.computeBoundingSphere();
  return merged;
}

/** Parallel horizontal folia wrapping the cerebellum. */
export function createCerebellumFoliaGeometry(): THREE.BufferGeometry {
  const random = mulberry32(0x2c1b3d4f);
  const [rx, ry, rz] = CEREBELLUM_RADII;
  const [cx, cy, cz] = CEREBELLUM_CENTER;
  const tubes: THREE.BufferGeometry[] = [];

  for (let band = -7; band <= 7; band += 1) {
    const v = band / 8.6;
    const slice = Math.sqrt(Math.max(0.02, 1 - v * v));
    const points: THREE.Vector3[] = [];
    const count = 44;

    for (let index = 0; index < count; index += 1) {
      const angle = (index / count) * Math.PI * 2;
      const wobble = 1 + 0.012 * Math.sin(angle * 5 + band * 0.8);
      points.push(
        new THREE.Vector3(
          cx + Math.cos(angle) * rx * slice * wobble * 1.04,
          cy + v * ry * 1.02,
          cz + Math.sin(angle) * rz * slice * wobble * 1.04,
        ),
      );
    }

    const curve = new THREE.CatmullRomCurve3(points, true, 'centripetal');
    tubes.push(new THREE.TubeGeometry(curve, 64, 0.26 + random() * 0.12, 6, true));
  }

  const merged = mergeGeometries(tubes, false);
  for (const tube of tubes) tube.dispose();
  if (!merged) return new THREE.BufferGeometry();
  merged.computeBoundingSphere();
  return merged;
}
