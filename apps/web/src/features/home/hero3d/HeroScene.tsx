"use client";

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useEffect, useRef } from "react";
import { ACESFilmicToneMapping, MathUtils, type Group } from "three";
import { CoinRing } from "./CoinRing";
import { Environment } from "./Environment";
import { Medal } from "./Medal";
import { ParticleField } from "./ParticleField";
import { useFaceTextures } from "./useFaceTextures";
import { HERO_ASSETS } from "./hero-assets";
import { useAssetTextures } from "./useAssetTextures";

const DESKTOP_MIN_WIDTH = 960;
const MEDAL_LABEL = "fIPO";
const POINTER_EASING = 3;
/** Orbit radius plus coin radius, in scene units, and the share of the half-width the ring may fill. */
const RING_EXTENT = 3.4;
const RING_FIT = 0.46;
const MIN_SCALE = 0.3;
const MAX_SCALE = 0.62;
const DESKTOP_VERTICAL_OFFSET = 0;
const MOBILE_VERTICAL_OFFSET = -0.5;

interface HeroSceneProps {
  /** Whether the scene should render continuously. */
  active: boolean;
  /** Honour reduced motion by holding every object still. */
  animate: boolean;
}

function useNormalizedPointer() {
  const pointer = useRef({ x: 0, y: 0 });

  useEffect(() => {
    const update = (event: PointerEvent) => {
      pointer.current.x = (event.clientX / window.innerWidth) * 2 - 1;
      pointer.current.y = (event.clientY / window.innerHeight) * 2 - 1;
    };
    window.addEventListener("pointermove", update, { passive: true });
    return () => window.removeEventListener("pointermove", update);
  }, []);

  return pointer;
}

function Stage({ animate }: { animate: boolean }) {
  const rig = useRef<Group>(null);
  const medal = useRef<Group>(null);
  const particleOpacity = useRef(1);
  const pointer = useNormalizedPointer();
  const size = useThree((state) => state.size);
  const viewport = useThree((state) => state.viewport);
  const medalFaces = useFaceTextures([MEDAL_LABEL], 150);
  const assetFaces = useAssetTextures(HERO_ASSETS);

  const wide = size.width >= DESKTOP_MIN_WIDTH;
  const particleCount = wide ? 2000 : 900;

  useFrame(({ clock, scene }, delta) => {
    const group = rig.current;
    if (!group) return;

    const scroll = MathUtils.clamp(window.scrollY / size.height, 0, 1);
    const targetY = (wide ? DESKTOP_VERTICAL_OFFSET : MOBILE_VERTICAL_OFFSET) + scroll * 1.4;
    const ease = animate ? 1 - Math.exp(-POINTER_EASING * delta) : 1;

    group.position.y = MathUtils.lerp(group.position.y, targetY, ease);
    group.scale.setScalar(MathUtils.clamp((viewport.width * RING_FIT) / RING_EXTENT, MIN_SCALE, MAX_SCALE));

    if (animate) {
      group.rotation.y = MathUtils.lerp(group.rotation.y, pointer.current.x * 0.4, ease);
      group.rotation.x = MathUtils.lerp(group.rotation.x, pointer.current.y * 0.22, ease);
      scene.environmentRotation.y = clock.elapsedTime * 0.12 + pointer.current.x * 0.8;
      if (medal.current) medal.current.rotation.y = Math.sin(clock.elapsedTime * 0.5) * 0.35;
    }
    particleOpacity.current = 1 - scroll * 0.85;
  });

  return (
    <>
      <Environment />
      <ParticleField count={particleCount} opacityRef={particleOpacity} animate={animate} />
      <group ref={rig} position={[0, wide ? DESKTOP_VERTICAL_OFFSET : MOBILE_VERTICAL_OFFSET, 0]}>
        {medalFaces && assetFaces && (
          <>
            <group ref={medal}>
              <Medal face={medalFaces.get(MEDAL_LABEL)!} />
            </group>
            <CoinRing assets={HERO_ASSETS} faces={assetFaces} animate={animate} />
          </>
        )}
      </group>
    </>
  );
}

export default function HeroScene({ active, animate }: HeroSceneProps) {
  return (
    <Canvas
      frameloop={active ? "always" : "demand"}
      dpr={[1, 1.5]}
      camera={{ position: [0, 0, 8.5], fov: 38 }}
      gl={{ antialias: true, alpha: true, powerPreference: "high-performance", toneMapping: ACESFilmicToneMapping }}
      aria-hidden="true"
    >
      <Stage animate={animate} />
    </Canvas>
  );
}
