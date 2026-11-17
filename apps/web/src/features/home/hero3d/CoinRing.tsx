"use client";

import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import type { Group, Texture } from "three";
import type { HeroAsset } from "./hero-assets";

const RADIUS = 2.9;
const COIN_RADIUS = 0.46;
const COIN_THICKNESS = 0.09;
const SPIN_SPEED = 0.1;
const TILT = 0.38;

interface CoinRingProps {
  assets: readonly HeroAsset[];
  faces: ReadonlyMap<string, Texture>;
  /** When false the ring holds still. */
  animate: boolean;
}

/** Tickers orbiting the medal on a tilted ring, one coin per index constituent. */
export function CoinRing({ assets, faces, animate }: CoinRingProps) {
  const spinner = useRef<Group>(null);

  useFrame((_, delta) => {
    if (animate && spinner.current) spinner.current.rotation.y += delta * SPIN_SPEED;
  });

  return (
    <group rotation={[TILT, 0, -0.08]}>
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[RADIUS, 0.006, 8, 220]} />
        <meshBasicMaterial color="#ffffff" transparent opacity={0.35} />
      </mesh>

      <group ref={spinner}>
        {assets.map((asset, index) => {
          const angle = (index / assets.length) * Math.PI * 2;
          const face = faces.get(asset.ticker);
          return (
            <group key={asset.ticker} position={[Math.cos(angle) * RADIUS, 0, Math.sin(angle) * RADIUS]} rotation={[0, Math.PI / 2 - angle, 0]}>
              <mesh rotation={[Math.PI / 2, 0, 0]}>
                <cylinderGeometry args={[COIN_RADIUS, COIN_RADIUS, COIN_THICKNESS, 64]} />
                <meshPhysicalMaterial attach="material-0" color="#d7dae0" metalness={1} roughness={0.22} />
                <meshPhysicalMaterial attach="material-1" map={face} metalness={0.08} roughness={0.3} clearcoat={0.65} />
                <meshPhysicalMaterial attach="material-2" map={face} metalness={0.08} roughness={0.3} clearcoat={0.65} />
              </mesh>
              <mesh>
                <torusGeometry args={[COIN_RADIUS, 0.035, 24, 80]} />
                <meshPhysicalMaterial color="#f3f5f8" metalness={1} roughness={0.16} clearcoat={1} />
              </mesh>
            </group>
          );
        })}
      </group>
    </group>
  );
}
