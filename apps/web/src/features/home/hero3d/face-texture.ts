import { CanvasTexture, SRGBColorSpace } from "three";

const SIZE = 512;
const ANISOTROPY = 8;

function drawRings(context: CanvasRenderingContext2D) {
  const center = SIZE / 2;
  [0.94, 0.88].forEach((ratio, index) => {
    context.beginPath();
    context.arc(center, center, center * ratio, 0, Math.PI * 2);
    context.lineWidth = index === 0 ? 3 : 1.5;
    context.strokeStyle = `rgba(255,255,255,${index === 0 ? 0.55 : 0.22})`;
    context.stroke();
  });
}

function drawLabel(context: CanvasRenderingContext2D, label: string, fontFamily: string, fontSize: number) {
  const gradient = context.createLinearGradient(0, SIZE * 0.3, SIZE, SIZE * 0.7);
  gradient.addColorStop(0, "#ffffff");
  gradient.addColorStop(0.45, "#8d9199");
  gradient.addColorStop(1, "#f4f5f7");

  context.fillStyle = gradient;
  context.font = `700 ${fontSize}px ${fontFamily}`;
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(label, SIZE / 2, SIZE / 2 + fontSize * 0.04);
}

/** Dark engraved disc with a metallic label, used as the face of a coin. */
export function createFaceTexture(label: string, fontFamily: string, fontSize: number): CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = SIZE;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("2D canvas is unavailable");

  const background = context.createRadialGradient(SIZE * 0.35, SIZE * 0.3, 20, SIZE / 2, SIZE / 2, SIZE * 0.7);
  background.addColorStop(0, "#2d2e33");
  background.addColorStop(1, "#050506");
  context.fillStyle = background;
  context.fillRect(0, 0, SIZE, SIZE);

  drawRings(context);
  drawLabel(context, label, fontFamily, fontSize);

  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = ANISOTROPY;
  /* Cylinder caps are UV-mapped a quarter turn off, so turn the art back upright. */
  texture.center.set(0.5, 0.5);
  texture.rotation = Math.PI / 2;
  return texture;
}
