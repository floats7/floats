"use client";

import { useEffect, useState } from "react";
import type { CanvasTexture } from "three";
import { createFaceTexture } from "./face-texture";

const FALLBACK_FONT = "Helvetica Neue, Arial, sans-serif";

/** Builds one texture per label once web fonts are ready, and frees them on unmount. */
export function useFaceTextures(labels: readonly string[], fontSize: number): Map<string, CanvasTexture> | null {
  const [textures, setTextures] = useState<Map<string, CanvasTexture> | null>(null);
  const key = labels.join("|");

  useEffect(() => {
    let cancelled = false;
    let created: CanvasTexture[] = [];

    document.fonts.ready.then(() => {
      if (cancelled) return;
      const family = getComputedStyle(document.documentElement).getPropertyValue("--font-display").trim() || FALLBACK_FONT;
      created = key.split("|").map((label) => createFaceTexture(label, family, fontSize));
      setTextures(new Map(key.split("|").map((label, index) => [label, created[index]!])));
    });

    return () => {
      cancelled = true;
      created.forEach((texture) => texture.dispose());
    };
  }, [key, fontSize]);

  return textures;
}
