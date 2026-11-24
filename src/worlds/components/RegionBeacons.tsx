import { Html } from '@react-three/drei';
import * as THREE from 'three';
import { REGION_META, type Region } from '../../core/types';
import { getClusterName } from '../../lib/clusterNames';
import type { SceneLayout } from '../layout';
import { STELLAR_ACCENTS } from './StarNode';

interface RegionBeaconsProps {
  layout: SceneLayout;
  variant: 'ring' | 'label';
  opacity: number;
  clusterNames?: Record<Region, string>;
  /** Galaxy labels use desaturated stellar tints instead of HUD accents. */
  tone?: 'default' | 'stellar';
  /** Blur cluster titles (e.g. in home mode) so they don't leak through. */
  blur?: boolean;
}

/** Optional boundary ring plus an always-on label for each region. */
export function RegionBeacons({
  layout,
  variant,
  opacity,
  clusterNames,
  tone = 'default',
  blur = false,
}: RegionBeaconsProps) {
  return (
    <>
      {layout.regions.map(({ region, center, radius }) => {
        const meta = REGION_META[region];
        const tint = tone === 'stellar' ? STELLAR_ACCENTS[region] : meta.accent;
        return (
          <group key={region} position={center}>
            {variant === 'ring' && (
              <mesh rotation={[Math.PI / 2, 0, 0]} raycast={() => null}>
                <torusGeometry args={[radius * 1.15, 0.025, 8, 96]} />
                <meshBasicMaterial
                  color={tint}
                  transparent
                  opacity={opacity}
                  blending={THREE.AdditiveBlending}
                  depthWrite={false}
                  toneMapped={false}
                />
              </mesh>
            )}

            <Html
              position={[0, radius + 2.4, 0]}
              center
              zIndexRange={[20, 0]}
              style={{ pointerEvents: 'none' }}
            >
              <div className="whitespace-nowrap text-center">
                <p
                  className="text-[10px] font-semibold uppercase tracking-[0.24em]"
                  style={{
                    color: tint,
                    textShadow: '0 0 14px rgba(0,0,0,0.95)',
                    filter: blur ? 'blur(4px)' : undefined,
                    transition: 'filter 180ms ease',
                  }}
                >
                  {getClusterName(clusterNames, region)}
                </p>
                <p className="hidden text-[9px] text-slate-400/80 md:block">
                  {meta.description}
                </p>
              </div>
            </Html>
          </group>
        );
      })}
    </>
  );
}
