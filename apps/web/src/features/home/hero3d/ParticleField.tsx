"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { useMemo, useRef, type RefObject } from "react";
import { AdditiveBlending, BufferAttribute, BufferGeometry, ShaderMaterial } from "three";
import { FRAGMENT_SHADER, VERTEX_SHADER } from "./particles.glsl";

const INNER_RADIUS = 2.4;
const OUTER_RADIUS = 10;
const BASE_SIZE = 38;

interface ParticleFieldProps {
  count: number;
  /** 0..1 multiplier, lowered as the hero scrolls away. */
  opacityRef: RefObject<number>;
  animate: boolean;
}

function buildGeometry(count: number): BufferGeometry {
  const positions = new Float32Array(count * 3);
  const scales = new Float32Array(count);
  const phases = new Float32Array(count);

  for (let index = 0; index < count; index++) {
    const radius = INNER_RADIUS + Math.cbrt(Math.random()) * (OUTER_RADIUS - INNER_RADIUS);
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    positions.set([radius * Math.sin(phi) * Math.cos(theta), radius * Math.cos(phi) * 0.7, radius * Math.sin(phi) * Math.sin(theta)], index * 3);
    scales[index] = 0.4 + Math.random() * 1.4;
    phases[index] = Math.random();
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(positions, 3));
  geometry.setAttribute("aScale", new BufferAttribute(scales, 1));
  geometry.setAttribute("aPhase", new BufferAttribute(phases, 1));
  return geometry;
}

/** Soft additive dust that drifts and twinkles inside a shell around the scene. */
export function ParticleField({ count, opacityRef, animate }: ParticleFieldProps) {
  const pixelRatio = useThree((state) => state.gl.getPixelRatio());
  const geometry = useMemo(() => buildGeometry(count), [count]);
  const material = useRef<ShaderMaterial>(null);

  useFrame(({ clock }) => {
    const uniforms = material.current?.uniforms;
    if (!uniforms) return;
    if (animate) uniforms.uTime!.value = clock.elapsedTime;
    uniforms.uOpacity!.value = opacityRef.current;
  });

  return (
    <points geometry={geometry} frustumCulled={false}>
      <shaderMaterial
        ref={material}
        vertexShader={VERTEX_SHADER}
        fragmentShader={FRAGMENT_SHADER}
        uniforms={{ uTime: { value: 0 }, uSize: { value: BASE_SIZE }, uPixelRatio: { value: pixelRatio }, uOpacity: { value: 1 } }}
        transparent
        depthWrite={false}
        blending={AdditiveBlending}
      />
    </points>
  );
}
