"use client";

import type { CanvasTexture } from "three";

const RADIUS = 1.25;
const THICKNESS = 0.22;

const METAL = { color: "#d7dae0", metalness: 1, roughness: 0.2 } as const;

/** Central chrome medallion. The cylinder axis points at the camera. */
export function Medal({ face }: { face: CanvasTexture }) {
  return (
    <group>
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[RADIUS, RADIUS, THICKNESS, 128]} />
        <meshPhysicalMaterial attach="material-0" {...METAL} clearcoat={0.6} />
        <meshStandardMaterial attach="material-1" map={face} metalness={0.55} roughness={0.32} />
        <meshStandardMaterial attach="material-2" map={face} metalness={0.55} roughness={0.32} />
      </mesh>
      <mesh>
        <torusGeometry args={[RADIUS, 0.09, 48, 160]} />
        <meshPhysicalMaterial {...METAL} clearcoat={1} clearcoatRoughness={0.1} />
      </mesh>
    </group>
  );
}
