"use client";

import { useThree } from "@react-three/fiber";
import { useEffect } from "react";
import { PMREMGenerator } from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";

/** Procedural studio reflections for the metal. Generated locally, so nothing is downloaded. */
export function Environment() {
  const gl = useThree((state) => state.gl);
  const read = useThree((state) => state.get);

  useEffect(() => {
    const scene = read().scene;
    const generator = new PMREMGenerator(gl);
    const target = generator.fromScene(new RoomEnvironment(), 0.04);
    scene.environment = target.texture;

    return () => {
      scene.environment = null;
      target.dispose();
      generator.dispose();
    };
  }, [gl, read]);

  return null;
}
