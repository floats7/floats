"use client";

import { useEffect, useState } from "react";
import { SRGBColorSpace, TextureLoader, type Texture } from "three";
import type { HeroAsset } from "./hero-assets";

/** Loads local company marks once and releases their GPU resources on unmount. */
export function useAssetTextures(assets: readonly HeroAsset[]): ReadonlyMap<string, Texture> | null {
  const [textures, setTextures] = useState<ReadonlyMap<string, Texture> | null>(null);
  const key = assets.map(({ ticker, logo }) => `${ticker}:${logo}`).join("|");

  useEffect(() => {
    let cancelled = false;
    let created: Texture[] = [];
    const loader = new TextureLoader();

    Promise.all(assets.map(({ logo }) => loader.loadAsync(logo)))
      .then((loaded) => {
        created = loaded;
        loaded.forEach((texture) => {
          texture.colorSpace = SRGBColorSpace;
          texture.anisotropy = 8;
          texture.center.set(0.5, 0.5);
          texture.rotation = Math.PI / 2;
        });
        if (!cancelled) {
          setTextures(new Map(assets.map(({ ticker }, index) => [ticker, loaded[index]!])));
        }
      })
      .catch(() => {
        created.forEach((texture) => texture.dispose());
        if (!cancelled) setTextures(new Map());
      });

    return () => {
      cancelled = true;
      created.forEach((texture) => texture.dispose());
    };
  }, [assets, key]);

  return textures;
}
