interface PlanetPreviewProps {
  seed: string;
  color: string;
  /** Number of moons rendered as orbiting dots. */
  moons?: number;
  size?: number;
}

function hash(value: string): number {
  let h = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    h ^= value.charCodeAt(index);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * CSS-only spinning planet used inside the unit cards. Keeps the HUD cheap:
 * no WebGL context per card, and it still reads as the same body you can fly
 * to in the 3D scene.
 */
export function PlanetPreview({ seed, color, moons = 0, size = 56 }: PlanetPreviewProps) {
  const hashValue = hash(seed);
  const tilt = 8 + (hashValue % 18);
  const duration = 6 + (hashValue % 7);
  const hasRing = hashValue % 3 === 0;
  const visibleMoons = Math.min(moons, 3);

  return (
    <div
      className="planet-preview"
      style={{
        width: size,
        height: size,
        ['--planet-color' as string]: color,
        ['--planet-preview-size' as string]: `${size}px`,
        ['--planet-tilt' as string]: `${tilt}deg`,
        ['--planet-spin-duration' as string]: `${duration}s`,
      }}
      aria-hidden="true"
    >
      <div className="planet-preview__ball" />
      {hasRing && <div className="planet-preview__ring" />}
      {visibleMoons > 0 && (
        <div
          className="planet-preview__orbit"
          style={{ ['--moon-count' as string]: String(visibleMoons) }}
        >
          {Array.from({ length: visibleMoons }, (_, index) => (
            <span
              key={index}
              className="planet-preview__moon"
              style={{ ['--moon-index' as string]: String(index) }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
