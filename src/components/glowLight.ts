/**
 * The light behind the hero cube (components/site.tsx GlowCube), in the manner of the Vercel triangle: a
 * light source just behind one edge of the silhouette, lighting the backdrop — brightest right at that
 * edge, fading away from it, with soft shadow wedges from the corners where the cube stands between the
 * source and the backdrop. A WebGL2 fragment shader tests every pixel against a few points of the (slightly
 * long) source.
 *
 * The source slides around behind the cube's edges by itself; a mouse pointer pulls it to the side facing
 * the pointer, and a few seconds after the pointer stops it slides on again. Only made in the browser
 * (after mount); without WebGL2 GlowCube keeps its static SVG glow.
 */

/** The cube's outline in its own units (200 × 230, y down), clockwise on screen. */
const OUTLINE: Array<[number, number]> = [
  [100, 8],
  [187, 58],
  [187, 172],
  [100, 222],
  [13, 172],
  [13, 58],
];
const CENTRE = { x: 100, y: 115 };

const VERTEX = `#version 300 es
in vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }`;

/**
 * The occluder: the outline shrunk a little about the centre, so the source (just inside the visible
 * silhouette, hidden by it) is outside the occluder and lights the backdrop right up to the cube's edge.
 */
const OCCLUDER_SCALE = 0.93;
/** The source is this far inside the visible outline. */
const SOURCE_INSET = 2;

const FRAGMENT = `#version 300 es
precision highp float;
uniform vec2 uRes;
uniform vec4 uView;
uniform vec2 uLight;
uniform vec2 uTangent;
uniform float uTime;
out vec4 outColor;

const vec2 C = vec2(${CENTRE.x.toFixed(1)}, ${CENTRE.y.toFixed(1)});
const vec2 V[6] = vec2[6](${OUTLINE.map(([x, y]) => `vec2(${x.toFixed(1)}, ${y.toFixed(1)})`).join(', ')});
const int SAMPLES = 9;

float hash(vec2 p) {
  vec3 q = fract(vec3(p.xyx) * 0.1031);
  q += dot(q, q.yzx + 33.33);
  return fract((q.x + q.y) * q.z);
}

/** Does the segment a→b cross the occluder (the outline shrunk about C)? Cyrus–Beck clipping. */
bool blocked(vec2 a, vec2 b) {
  float t0 = 0.0;
  float t1 = 1.0;
  vec2 d = b - a;
  for (int i = 0; i < 6; i++) {
    vec2 p0 = C + (V[i] - C) * ${OCCLUDER_SCALE.toFixed(3)};
    vec2 p1 = C + (V[(i + 1) % 6] - C) * ${OCCLUDER_SCALE.toFixed(3)};
    vec2 e = p1 - p0;
    vec2 n = vec2(-e.y, e.x);
    float num = dot(n, a - p0);
    float den = dot(n, d);
    if (abs(den) < 1e-6) {
      if (num < 0.0) return false;
    } else {
      float t = -num / den;
      if (den > 0.0) t0 = max(t0, t);
      else t1 = min(t1, t);
      if (t0 > t1) return false;
    }
  }
  return true;
}

void main() {
  vec2 p = vec2(uView.x + gl_FragCoord.x / uRes.x * uView.z, uView.y + (1.0 - gl_FragCoord.y / uRes.y) * uView.w);
  // A source a little long along the cube's edge: soft shadow borders. Jittered per pixel against banding.
  float jitter = hash(gl_FragCoord.xy + fract(uTime) * 61.0) - 0.5;
  float sum = 0.0;
  for (int i = 0; i < SAMPLES; i++) {
    float k = (float(i) + 0.5 + jitter) / float(SAMPLES) - 0.5;
    vec2 l = uLight + uTangent * k * 52.0;
    if (blocked(l, p)) continue;
    float d = length(p - l);
    sum += exp(-d / 30.0) + 0.32 * exp(-d / 105.0);
  }
  sum /= float(SAMPLES);
  // A thin rim all around the outline (strongest on the source's side) and a faint haze: the backdrop
  // catches a little light everywhere.
  float edge = 1e9;
  for (int i = 0; i < 6; i++) {
    vec2 a = V[i];
    vec2 e = V[(i + 1) % 6] - a;
    float h = clamp(dot(p - a, e) / dot(e, e), 0.0, 1.0);
    edge = min(edge, length(p - a - e * h));
  }
  float facing = max(0.0, dot(normalize(p - C), normalize(uLight - C)));
  sum += 0.4 * exp(-edge / 6.0) * (0.3 + 0.7 * facing);
  sum += 0.07 * exp(-length(p - C) / 120.0);
  float b = 1.0 - exp(-sum * 1.7);
  // Fade out well inside the canvas, so its edge never shows.
  vec2 r = (p - vec2(100.0, 110.0)) / vec2(uView.z, uView.w) * 2.0;
  b *= smoothstep(1.0, 0.62, length(r));
  outColor = vec4(vec3(b), 1.0);
}`;

/** Where a ray from the centre at `angle` leaves the outline (distance from the centre). */
function edgeDistance(angle: number): number {
  const dx = Math.cos(angle);
  const dy = Math.sin(angle);
  let best = Infinity;
  for (let i = 0; i < OUTLINE.length; i++) {
    const [ax, ay] = OUTLINE[i];
    const [bx, by] = OUTLINE[(i + 1) % OUTLINE.length];
    const ex = bx - ax;
    const ey = by - ay;
    const den = dx * ey - dy * ex;
    if (Math.abs(den) < 1e-9) continue;
    const t = ((ax - CENTRE.x) * ey - (ay - CENTRE.y) * ex) / den;
    const u = ((ax - CENTRE.x) * dy - (ay - CENTRE.y) * dx) / den;
    if (t > 0 && u >= -1e-6 && u <= 1 + 1e-6) best = Math.min(best, t);
  }
  return Number.isFinite(best) ? best : 80;
}

function compile(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader | null {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.warn(gl.getShaderInfoLog(shader));
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

/** Seconds of no pointer movement after which the light drifts again. */
const IDLE_AFTER = 2.5;
/** The source slides once around the cube in this many seconds while nobody moves the mouse. */
const DRIFT_PERIOD = 14;
/** The canvas renders at this share of the CSS size: the glow is soft, the grain is a CSS layer on top. */
const RESOLUTION = 0.6;

export interface GlowLight {
  dispose(): void;
}

/**
 * Starts the light on `canvas` (which covers the `view` box of the cube's units). `box` is the cube's own
 * box, used to aim at the pointer. Returns null without WebGL2.
 */
export function startGlowLight(
  canvas: HTMLCanvasElement,
  box: HTMLElement,
  view: { x: number; y: number; w: number; h: number },
  onReady: () => void,
): GlowLight | null {
  const gl = canvas.getContext('webgl2', { antialias: false, alpha: false, premultipliedAlpha: false });
  if (!gl || gl.isContextLost()) return null;
  const vs = compile(gl, gl.VERTEX_SHADER, VERTEX);
  const fs = compile(gl, gl.FRAGMENT_SHADER, FRAGMENT);
  if (!vs || !fs) return null;
  const program = gl.createProgram()!;
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return null;
  gl.useProgram(program);

  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const aPos = gl.getAttribLocation(program, 'aPos');
  gl.enableVertexAttribArray(aPos);
  gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);
  const u = {
    res: gl.getUniformLocation(program, 'uRes'),
    view: gl.getUniformLocation(program, 'uView'),
    light: gl.getUniformLocation(program, 'uLight'),
    tangent: gl.getUniformLocation(program, 'uTangent'),
    time: gl.getUniformLocation(program, 'uTime'),
  };
  gl.uniform4f(u.view, view.x, view.y, view.w, view.h);

  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let width = 0;
  let height = 0;
  const resize = () => {
    const r = canvas.getBoundingClientRect();
    width = Math.max(1, Math.round(r.width * RESOLUTION));
    height = Math.max(1, Math.round(r.height * RESOLUTION));
    canvas.width = width;
    canvas.height = height;
    gl.viewport(0, 0, width, height);
    gl.uniform2f(u.res, width, height);
  };
  resize();

  // The source: its direction from the centre; it sits just inside the outline that way.
  let angle = -Math.PI / 2 - 0.6;
  let aim: number | null = null;
  let lastPointer = -Infinity;
  let visible = true;
  let frame = 0;
  let last = performance.now();
  let first = true;

  const draw = (now: number) => {
    frame = 0;
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    const t = now / 1000;
    if (!reduce) {
      if (aim === null || t - lastPointer > IDLE_AFTER) angle += ((Math.PI * 2) / DRIFT_PERIOD) * dt;
      else {
        const delta = Math.atan2(Math.sin(aim - angle), Math.cos(aim - angle));
        angle += delta * Math.min(1, dt * 4);
      }
    }
    const dx = Math.cos(angle);
    const dy = Math.sin(angle);
    const r = edgeDistance(angle) - SOURCE_INSET;
    gl.uniform2f(u.light, CENTRE.x + dx * r, CENTRE.y + dy * r);
    gl.uniform2f(u.tangent, -dy, dx);
    gl.uniform1f(u.time, t);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    if (first) {
      first = false;
      onReady();
    }
    if (visible && !reduce) frame = requestAnimationFrame(draw);
  };

  const onMove = (e: PointerEvent) => {
    if (e.pointerType !== 'mouse') return;
    const r = box.getBoundingClientRect();
    const dx = e.clientX - (r.left + r.width / 2);
    const dy = e.clientY - (r.top + r.height / 2);
    aim = Math.atan2(dy, dx);
    lastPointer = performance.now() / 1000;
  };
  const observer = new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    if (visible && !frame) {
      last = performance.now();
      frame = requestAnimationFrame(draw);
    }
  });
  const sizes = new ResizeObserver(resize);

  window.addEventListener('pointermove', onMove, { passive: true });
  observer.observe(canvas);
  sizes.observe(canvas);
  frame = requestAnimationFrame(draw);

  return {
    dispose() {
      cancelAnimationFrame(frame);
      window.removeEventListener('pointermove', onMove);
      observer.disconnect();
      sizes.disconnect();
      gl.deleteBuffer(buffer);
      gl.deleteProgram(program);
      gl.deleteShader(vs);
      gl.deleteShader(fs);
      // The context stays: a canvas gives the same one back, and React may start the light again on it.
    },
  };
}
