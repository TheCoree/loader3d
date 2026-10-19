import { CARGO_COLORS } from '../core/presets';

/** [i, j, k]: grid position (along, across, up) of a unit cube in the isometric stack. */
const STACK: Array<[number, number, number, number]> = [
  [0, 0, 0, 1],
  [1, 0, 0, 0],
  [2, 0, 0, 1],
  [0, 1, 0, 4],
  [1, 1, 0, 2],
  [2, 1, 0, 0],
  [0, 2, 0, 1],
  [1, 2, 0, 4],
  [0, 0, 1, 2],
  [1, 0, 1, 4],
  [0, 1, 1, 0],
  [1, 1, 1, 1],
  [0, 0, 2, 0],
];

const S = 46;
const DX = S * 0.866;

function Cube({ i, j, k, color }: { i: number; j: number; k: number; color: string }) {
  const cx = (i - j) * DX;
  const cy = (i + j) * (S / 2) - k * S;
  const top = `${cx},${cy - S} ${cx + DX},${cy - S / 2} ${cx},${cy} ${cx - DX},${cy - S / 2}`;
  const left = `${cx - DX},${cy - S / 2} ${cx},${cy} ${cx},${cy + S} ${cx - DX},${cy + S / 2}`;
  const right = `${cx},${cy} ${cx + DX},${cy - S / 2} ${cx + DX},${cy + S / 2} ${cx},${cy + S}`;
  return (
    <g strokeLinejoin="round" stroke="rgba(15,23,42,0.18)" strokeWidth={1}>
      <polygon points={top} fill={color} />
      <polygon points={left} fill={color} />
      <polygon points={left} fill="#0f172a" opacity={0.14} />
      <polygon points={right} fill={color} />
      <polygon points={right} fill="#0f172a" opacity={0.28} />
    </g>
  );
}

/** Decorative isometric stack of cargo for the login screen. */
export function CargoIllustration({ className }: { className?: string }) {
  const cubes = [...STACK].sort((a, b) => a[0] + a[1] - (b[0] + b[1]) || a[2] - b[2]);
  return (
    <svg viewBox="-200 -170 360 300" className={className} aria-hidden>
      <ellipse cx={-20} cy={118} rx={170} ry={26} fill="#0f172a" opacity={0.12} />
      {cubes.map(([i, j, k, c]) => (
        <Cube key={`${i}${j}${k}`} i={i} j={j} k={k} color={CARGO_COLORS[c]} />
      ))}
    </svg>
  );
}
