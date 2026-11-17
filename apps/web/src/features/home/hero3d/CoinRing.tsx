"use client";

import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import type { CanvasTexture, Group } from "three";

const RADIUS = 2.9;
const COIN_RADIUS = 0.46;
const COIN_THICKNESS = 0.09;
const SPIN_SPEED = 0.1;
const TILT = 0.38;

interface CoinRingProps {
  tickers: readonly string[];
  faces: ReadonlyMap<string, CanvasTexture>;
  /** When false the ring holds still. */
  animate: boolean;
}

/** Tickers orbiting the medal on a tilted ring, one coin per index constituent. */
export function CoinRing({ tickers, faces, animate }: CoinRingProps) {
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
        {tickers.map((ticker, index) => {
          const angle = (index / tickers.length) * Math.PI * 2;
          const face = faces.get(ticker);
          return (
            <group key={ticker} position={[Math.cos(angle) * RADIUS, 0, Math.sin(angle) * RADIUS]} rotation={[0, Math.PI / 2 - angle, 0]}>
              <mesh rotation={[Math.PI / 2, 0, 0]}>
                <cylinderGeometry args={[COIN_RADIUS, COIN_RADIUS, COIN_THICKNESS, 64]} />
                <meshPhysicalMaterial attach="material-0" color="#d7dae0" metalness={1} roughness={0.22} />
                <meshStandardMaterial attach="material-1" map={face} metalness={0.5} roughness={0.35} />
                <meshStandardMaterial attach="material-2" map={face} metalness={0.5} roughness={0.35} />
              </mesh>
            </group>
          );
        })}
      </group>
    </group>
  );
}
