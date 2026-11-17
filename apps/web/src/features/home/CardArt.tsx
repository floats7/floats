/** Abstract metal line-art for each product card. Pure SVG, no raster assets. */
const SHARED = { fill: "none", stroke: "currentColor", strokeWidth: 1 } as const;

function IndexArt() {
  return (
    <>
      {[40, 80, 120, 160].map((radius) => (
        <circle key={radius} cx="200" cy="200" r={radius} {...SHARED} strokeDasharray={radius % 80 === 0 ? undefined : "2 6"} />
      ))}
      <circle cx="200" cy="200" r="10" fill="currentColor" />
      {[0, 72, 144, 216, 288].map((angle, index) => (
        <rect key={angle} x="192" y={40 + index * 4} width="8" height="8" {...SHARED} transform={`rotate(${angle} 200 200)`} />
      ))}
    </>
  );
}

function TradeArt() {
  return (
    <>
      {[0, 1, 2, 3, 4, 5].map((row) => (
        <path key={row} d={`M40 ${90 + row * 38}h${180 - row * 18}`} {...SHARED} strokeWidth={row === 2 ? 3 : 1} />
      ))}
      <path d="M250 150h110m-30-30 30 30-30 30" {...SHARED} strokeWidth="2" />
      <path d="M360 260H250m30 30-30-30 30-30" {...SHARED} strokeWidth="2" />
    </>
  );
}

function PipelineArt() {
  return (
    <>
      <path d="M40 300h320" {...SHARED} />
      {[0, 1, 2, 3, 4, 5, 6, 7].map((tick) => (
        <path key={tick} d={`M${60 + tick * 40} 300v-${tick % 2 ? 16 : 28}`} {...SHARED} />
      ))}
      {[120, 200, 280].map((x, index) => (
        <g key={x}>
          <rect x={x - 12} y={210 - index * 50} width="24" height="24" {...SHARED} />
          <path d={`M${x} ${234 - index * 50}V300`} {...SHARED} strokeDasharray="3 5" />
        </g>
      ))}
    </>
  );
}

const ARTS = { index: IndexArt, trade: TradeArt, pipeline: PipelineArt } as const;

export type CardArtName = keyof typeof ARTS;

export function CardArt({ name }: { name: CardArtName }) {
  const Art = ARTS[name];
  return (
    <svg viewBox="0 0 400 400" aria-hidden="true" preserveAspectRatio="xMidYMid slice">
      <Art />
    </svg>
  );
}
