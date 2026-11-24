import { useEffect, useRef } from 'react';
import { LogoMark } from '@/components/Logo';

/**
 * The hero of the landing page: the logo's box in motion (components/Logo.tsx — a box of three faces with thin gaps,
 * the end blue). It turns, comes apart and back together, stretches into a trailer and turns glassy, cargo boxes
 * drop in row after row from the front wall (floor, then the tier above) as autoload lays them, the trailer closes
 * and goes back into the logo — smooth, without overshoot. One timeline (CYCLE) on a canvas: a small 3D renderer of boxes
 * (turned, lit, in perspective, painted far to near), drawn once a frame while the hero is on screen.
 *
 * Prerendered with the landing page: the server and the first render in the browser give the logo (an SVG) and an
 * empty canvas; the script fades the canvas in over it once it draws. Nothing touches window or document while
 * rendering. With reduced motion the logo stays as it is.
 */

type V3 = [number, number, number];

/** ms. */
const CYCLE = 12_000;
const PHASE = {
  apart: [1300, 2050],
  together: [2050, 2900],
  stretch: [3000, 4300],
  load: [4300, 7900],
  close: [7900, 8900],
  shrink: [9000, 10100],
} as const;
/** The view turns about the vertical through the cycle: [ms, degrees]. 225° ≡ 45°: the box looks the same half a turn on. */
const YAW: Array<[number, number]> = [
  [0, 45],
  [2900, 135],
  [4300, 158],
  [7900, 166],
  [10100, 205],
  [CYCLE, 225],
];
const PITCH = (28 * Math.PI) / 180;
/** Perspective: the distance of the eye, in units of the box. */
const EYE = 7.5;

const TRAILER = { l: 3.6, h: 0.88, w: 0.88 };
const CARGO = { size: 0.38, pitch: 0.42, rows: 8, flight: 780, drop: 1.5 };
/** Between the faces of a box, in units: the gaps of the logo. */
const GAP = 0.03;
/** The cargo is line art: edges only, the faces the colour of the page (so the edges behind them do not show). */
const CARGO_GAP = 0;
const PAGE: V3 = [0, 0, 0];
const CARGO_EDGE = 0.72;

// --- easing -------------------------------------------------------------------------------------------

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const progress = (t: number, [a, b]: readonly [number, number]) => clamp01((t - a) / (b - a));
const inOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
const outCubic = (t: number) => 1 - (1 - t) ** 3;
const outQuint = (t: number) => 1 - (1 - t) ** 5;

function yawAt(t: number): number {
  for (let i = 1; i < YAW.length; i++) {
    const [t1, a1] = YAW[i];
    const [t0, a0] = YAW[i - 1];
    if (t <= t1) return ((a0 + (a1 - a0) * inOut((t - t0) / (t1 - t0))) * Math.PI) / 180;
  }
  return (YAW[YAW.length - 1][1] * Math.PI) / 180;
}

// --- the scene ----------------------------------------------------------------------------------------

interface Solid {
  /** Centre and size, units. */
  c: V3;
  s: V3;
  /** Its own turn about its centre (radians), its faces pushed out along their normals (units), its opacity. */
  spin: number;
  apart: number;
  scale: number;
  alpha: number;
}

interface Scene {
  yaw: number;
  bob: number;
  /** The camera closer to the cube, back for the trailer. */
  zoom: number;
  box: Solid;
  /** 1 — the solid faces of the logo; 0 — a glass box. */
  solid: number;
  cargo: Solid[];
}

/** The cargo of the trailer in the order autoload lays it: from the front wall (x max), floor and tier, row by row. */
const SLOTS: Array<{ c: V3; start: number }> = (() => {
  const list: V3[] = [];
  const x0 = -(CARGO.rows - 1) * CARGO.pitch * 0.5;
  for (let row = CARGO.rows - 1; row >= 0; row--) {
    for (const tier of [0, 1]) {
      for (const col of [-0.5, 0.5]) {
        list.push([x0 + row * CARGO.pitch, -TRAILER.h / 2 + 0.03 + CARGO.size / 2 + tier * CARGO.pitch, col * CARGO.pitch]);
      }
    }
  }
  const [from, to] = PHASE.load;
  const step = (to - from - CARGO.flight) / (list.length - 1);
  return list.map((c, i) => ({ c, start: from + i * step }));
})();

function sceneAt(t: number): Scene {
  // Stretch and shrink smoothly, no overshoot.
  const stretch = t < PHASE.shrink[0] ? inOut(progress(t, PHASE.stretch)) : 1 - inOut(progress(t, PHASE.shrink));
  const s: V3 = [1 + (TRAILER.l - 1) * stretch, 1 + (TRAILER.h - 1) * stretch, 1 + (TRAILER.w - 1) * stretch];
  // Apart and back together.
  const apart = t < PHASE.together[0] ? 0.4 * outCubic(progress(t, PHASE.apart)) : 0.4 * (1 - inOut(progress(t, PHASE.together)));
  const opening = inOut(progress(t, [PHASE.stretch[0] + 400, PHASE.stretch[1]]));
  const solid = t < PHASE.close[0] ? 1 - opening : inOut(progress(t, PHASE.close));
  const box: Solid = { c: [0, 0, 0], s, spin: 0, apart, scale: 1, alpha: 1 };
  const cargo: Solid[] = [];
  // The cargo fades away while the trailer closes over it.
  const fade = 1 - inOut(progress(t, [PHASE.close[0] - 300, PHASE.close[1]]));
  if (t >= PHASE.load[0] && t < PHASE.shrink[0]) {
    for (const slot of SLOTS) {
      if (t < slot.start) continue;
      const k = progress(t, [slot.start, slot.start + CARGO.flight]);
      // Drops in and settles, turning into place, growing from small.
      const fall = 1 - outQuint(k);
      cargo.push({
        c: [slot.c[0], slot.c[1] + CARGO.drop * fall, slot.c[2]],
        s: [CARGO.size, CARGO.size, CARGO.size],
        spin: (Math.PI / 2) * (1 - outCubic(k)),
        apart: 0,
        scale: 0.4 + 0.6 * outCubic(Math.min(1, k * 1.4)),
        alpha: clamp01(k * 5) * fade,
      });
    }
  }
  const zoom = 1.4 - 0.4 * Math.min(1, Math.max(0, (s[0] - 1) / (TRAILER.l - 1)));
  return { yaw: yawAt(t), bob: 0.035 * Math.sin((t / CYCLE) * Math.PI * 4), zoom, box, solid, cargo };
}

// --- drawing ------------------------------------------------------------------------------------------

/** The six faces of a box: normal axis and sign, and the colour of the logo's box (RGB). */
const FACES: Array<{ axis: 0 | 1 | 2; sign: 1 | -1; main: V3 }> = [
  { axis: 1, sign: 1, main: [237, 237, 237] },
  { axis: 1, sign: -1, main: [40, 40, 40] },
  { axis: 0, sign: 1, main: [47, 111, 237] },
  { axis: 0, sign: -1, main: [47, 111, 237] },
  { axis: 2, sign: 1, main: [128, 128, 128] },
  { axis: 2, sign: -1, main: [128, 128, 128] },
];
/** The light, in view space: from the upper left, in front. */
const LIGHT: V3 = (() => {
  const v: V3 = [-0.45, 0.8, 0.55];
  const n = Math.hypot(...v);
  return [v[0] / n, v[1] / n, v[2] / n];
})();

interface View {
  cosY: number;
  sinY: number;
  cosP: number;
  sinP: number;
  /** px per unit; the screen centre. */
  scale: number;
  cx: number;
  cy: number;
  bob: number;
}

/** Object space → view space: the view's turn, then the tilt (z towards the eye). */
function toView(p: V3, v: View): V3 {
  const x = p[0] * v.cosY + p[2] * v.sinY;
  const z = -p[0] * v.sinY + p[2] * v.cosY;
  const y = p[1] + v.bob;
  return [x, y * v.cosP - z * v.sinP, y * v.sinP + z * v.cosP];
}

function project(p: V3, v: View): [number, number] {
  const k = EYE / (EYE - p[2]);
  return [v.cx + p[0] * v.scale * k, v.cy - p[1] * v.scale * k];
}

interface Face {
  pts: Array<[number, number]>;
  depth: number;
  /** Turned towards the eye (the others are the inside of a glass box). */
  facing: boolean;
  fill: string;
  stroke: string | null;
}

/** The faces of a solid, lit; `back` — also the faces turned away (the inside of a glass box). */
function facesOf(b: Solid, v: View, colour: 'main' | 'cargo', alpha: number, edge: number, back: boolean, gap: number): Face[] {
  const out: Face[] = [];
  const cs = Math.cos(b.spin);
  const sn = Math.sin(b.spin);
  const half: V3 = [(b.s[0] * b.scale) / 2, (b.s[1] * b.scale) / 2, (b.s[2] * b.scale) / 2];
  const place = (p: V3): V3 => {
    // Its own turn about the vertical, then where it is.
    const x = p[0] * cs + p[2] * sn;
    const z = -p[0] * sn + p[2] * cs;
    return [b.c[0] + x, b.c[1] + p[1], b.c[2] + z];
  };
  for (const f of FACES) {
    const n: V3 = [0, 0, 0];
    n[f.axis] = f.sign;
    const nv = toView(place(n), { ...v, bob: 0 });
    const origin = toView(place([0, 0, 0]), { ...v, bob: 0 });
    const normal: V3 = [nv[0] - origin[0], nv[1] - origin[1], nv[2] - origin[2]];
    const facing = normal[2] > 0;
    if (!facing && !back) continue;
    const [a, c] = [0, 1, 2].filter((i) => i !== f.axis) as [number, number];
    const corners: V3[] = [
      [-1, -1],
      [1, -1],
      [1, 1],
      [-1, 1],
    ].map(([ua, uc]) => {
      const p: V3 = [0, 0, 0];
      p[f.axis] = f.sign * (half[f.axis] + b.apart);
      p[a] = ua * Math.max(0, half[a] - gap);
      p[c] = uc * Math.max(0, half[c] - gap);
      return toView(place(p), v);
    });
    const light = 0.68 + 0.32 * Math.max(0, normal[0] * LIGHT[0] + normal[1] * LIGHT[1] + normal[2] * LIGHT[2]);
    const rgb = colour === 'main' ? f.main.map((x) => Math.round(Math.min(255, x * light))).join(',') : PAGE.join(',');
    const a2 = facing ? alpha : alpha * 0.5;
    out.push({
      pts: corners.map((p) => project(p, v)),
      depth: corners.reduce((sum, p) => sum + p[2], 0) / 4,
      facing,
      fill: `rgba(${rgb},${a2.toFixed(3)})`,
      stroke: edge > 0.01 ? `rgba(237,237,237,${(facing ? edge : edge * 0.4).toFixed(3)})` : null,
    });
  }
  return out;
}

function paint(ctx: CanvasRenderingContext2D, faces: Face[]): void {
  for (const f of faces) {
    ctx.beginPath();
    ctx.moveTo(f.pts[0][0], f.pts[0][1]);
    for (let i = 1; i < f.pts.length; i++) ctx.lineTo(f.pts[i][0], f.pts[i][1]);
    ctx.closePath();
    ctx.fillStyle = f.fill;
    ctx.fill();
    if (f.stroke) {
      ctx.strokeStyle = f.stroke;
      ctx.stroke();
    }
  }
}

function draw(ctx: CanvasRenderingContext2D, width: number, height: number, t: number): void {
  const scene = sceneAt(t);
  const view: View = {
    cosY: Math.cos(scene.yaw),
    sinY: Math.sin(scene.yaw),
    cosP: Math.cos(PITCH),
    sinP: Math.sin(PITCH),
    scale: Math.min(width / 4.6, height / 3.1) * scene.zoom * 0.9,
    cx: width / 2,
    cy: height * 0.5,
    bob: scene.bob,
  };
  ctx.clearRect(0, 0, width, height);
  ctx.lineWidth = 1;
  ctx.lineJoin = 'round';
  const glass = 1 - scene.solid;
  const boxAlpha = scene.solid + glass * 0.07;
  const box = facesOf(scene.box, view, 'main', boxAlpha, 0.6 * glass, glass > 0.01, GAP);
  // The box's far faces, the cargo inside it (far to near), its near faces: the cargo never shows through a solid face.
  const byDepth = (a: Face, b: Face) => a.depth - b.depth;
  paint(ctx, box.filter((f) => !f.facing).sort(byDepth));
  const cargo = scene.cargo
    .map((c) => ({ c, depth: toView(c.c, view)[2] }))
    .sort((a, b) => a.depth - b.depth)
    .flatMap(({ c }) => facesOf(c, view, 'cargo', c.alpha, CARGO_EDGE * c.alpha, false, CARGO_GAP).sort((a, b) => a.depth - b.depth));
  paint(ctx, cargo);
  paint(ctx, box.filter((f) => f.facing).sort(byDepth));
}

export function HeroCubes() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const logoRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const logo = logoRef.current;
    if (!canvas || !logo || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let width = 0;
    let height = 0;
    const fit = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      width = canvas.clientWidth;
      height = canvas.clientHeight;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    fit();
    const resized = new ResizeObserver(fit);
    resized.observe(canvas);

    // The time runs only while the hero is on screen and the tab is visible (requestAnimationFrame stops then).
    let raf = 0;
    let elapsed = 0;
    let last = 0;
    let shown = false;
    const tick = (now: number) => {
      if (last) elapsed = (elapsed + Math.min(now - last, 64)) % CYCLE;
      last = now;
      draw(ctx, width, height, elapsed);
      if (!shown) {
        shown = true;
        canvas.style.opacity = '1';
        logo.style.opacity = '0';
      }
      raf = window.requestAnimationFrame(tick);
    };
    const start = () => {
      if (raf) return;
      last = 0;
      raf = window.requestAnimationFrame(tick);
    };
    const stop = () => {
      if (raf) window.cancelAnimationFrame(raf);
      raf = 0;
    };
    const seen = new IntersectionObserver(([entry]) => (entry.isIntersecting ? start() : stop()));
    seen.observe(canvas);
    return () => {
      seen.disconnect();
      resized.disconnect();
      stop();
    };
  }, []);

  return (
    <figure className="relative mx-auto w-full max-w-[560px]">
      <div className="relative aspect-[3/2] w-full">
        {/* The logo until the canvas draws (and for good with reduced motion). */}
        <div ref={logoRef} className="absolute inset-0 grid place-items-center transition-opacity duration-500">
          <LogoMark className="size-[38%] text-[#ededed]" />
        </div>
        <canvas
          ref={canvasRef}
          className="absolute inset-0 size-full opacity-0 transition-opacity duration-500"
          role="img"
          aria-label="Кубик Loader3D вращается, вытягивается в кузов, грузы сами раскладываются по нему рядами, и кузов снова становится кубиком"
        />
      </div>
    </figure>
  );
}
