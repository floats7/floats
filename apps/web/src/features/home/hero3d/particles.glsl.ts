export const VERTEX_SHADER = /* glsl */ `
  uniform float uTime;
  uniform float uSize;
  uniform float uPixelRatio;
  attribute float aScale;
  attribute float aPhase;
  varying float vTwinkle;

  void main() {
    vec3 drifted = position;
    drifted.x += sin(uTime * 0.15 + aPhase * 6.2831 + position.y) * 0.25;
    drifted.y += cos(uTime * 0.12 + aPhase * 6.2831 + position.x) * 0.25;

    vec4 viewPosition = modelViewMatrix * vec4(drifted, 1.0);
    gl_Position = projectionMatrix * viewPosition;
    gl_PointSize = uSize * aScale * uPixelRatio * (1.0 / -viewPosition.z);
    vTwinkle = 0.35 + 0.65 * (0.5 + 0.5 * sin(uTime * 0.8 + aPhase * 40.0));
  }
`;

export const FRAGMENT_SHADER = /* glsl */ `
  uniform float uOpacity;
  varying float vTwinkle;

  void main() {
    float falloff = smoothstep(0.5, 0.0, length(gl_PointCoord - 0.5));
    gl_FragColor = vec4(vec3(0.86, 0.89, 0.96), falloff * vTwinkle * uOpacity);
  }
`;
