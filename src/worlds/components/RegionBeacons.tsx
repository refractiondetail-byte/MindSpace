import { Html } from '@react-three/drei';
import * as THREE from 'three';
import { REGION_META } from '../../core/types';
import type { SceneLayout } from '../layout';

interface RegionBeaconsProps {
  layout: SceneLayout;
  variant: 'ring' | 'shell';
  opacity: number;
}

/** Region boundary + always-on label so the spatial map stays readable. */
export function RegionBeacons({ layout, variant, opacity }: RegionBeaconsProps) {
  return (
    <>
      {layout.regions.map(({ region, center, radius }) => {
        const meta = REGION_META[region];
        return (
          <group key={region} position={center}>
            {variant === 'ring' ? (
              <mesh rotation={[Math.PI / 2, 0, 0]} raycast={() => null}>
                <torusGeometry args={[radius * 1.15, 0.025, 8, 96]} />
                <meshBasicMaterial
                  color={meta.accent}
                  transparent
                  opacity={opacity}
                  blending={THREE.AdditiveBlending}
                  depthWrite={false}
                  toneMapped={false}
                />
              </mesh>
            ) : (
              <mesh raycast={() => null}>
                <icosahedronGeometry args={[radius * 1.25, 1]} />
                <meshBasicMaterial
                  color={meta.accent}
                  wireframe
                  transparent
                  opacity={opacity * 0.55}
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
                  style={{ color: meta.accent, textShadow: '0 0 14px rgba(0,0,0,0.95)' }}
                >
                  {meta.label}
                </p>
                <p className="hidden text-[9px] text-slate-400/80 md:block">{meta.description}</p>
              </div>
            </Html>
          </group>
        );
      })}
    </>
  );
}
