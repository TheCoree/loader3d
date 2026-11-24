import type { Plan } from '@/core/types';

/**
 * The plan of the demo (pages/DemoPage) on its way into a new account: «Сохранить схему» leads to the
 * registration with `/start?plan=…` in `state.from` (as «Попробовать в 3D» of the calculators does), and
 * /start (pages/StartPlanPage) saves it as the first plan. The whole plan travels — in the address, so a
 * reload on the way (the email code) does not lose it, and nothing is kept in the browser.
 *
 * The text: «z» + base64url of the plan's JSON compressed with deflate-raw (CompressionStream), or «j» +
 * base64url of the JSON itself where the browser cannot compress. Decoding gives the raw JSON value:
 * parsePlan() (core/plan.ts) checks it.
 */

/** Longer texts are not a plan of the demo (it has at most DEMO_LIMITS cargo). */
const MAX_CODE = 200_000;
/** A compressed text never unpacks to more than this (a hand-made one could try). */
const MAX_JSON = 4_000_000;

function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(text: string): Uint8Array<ArrayBuffer> | null {
  if (!/^[A-Za-z0-9_-]*$/.test(text)) return null;
  try {
    const binary = atob(text.replace(/-/g, '+').replace(/_/g, '/'));
    return Uint8Array.from(binary, (c) => c.charCodeAt(0));
  } catch {
    return null;
  }
}

/** Reads a stream into one array, giving up past `limit` bytes. */
async function readAll(stream: ReadableStream<Uint8Array>, limit: number): Promise<Uint8Array | null> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > limit) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const out = new Uint8Array(size);
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.length;
  }
  return out;
}

function streamOf(bytes: Uint8Array<ArrayBuffer>): ReadableStream<BufferSource> {
  return new ReadableStream<BufferSource>({
    start(controller) {
      controller.enqueue(bytes);
      controller.close();
    },
  });
}

const canCompress = () => typeof CompressionStream === 'function' && typeof DecompressionStream === 'function';

export async function encodePlanParam(plan: Plan): Promise<string> {
  const json = new TextEncoder().encode(JSON.stringify(plan));
  if (canCompress()) {
    try {
      const packed = await readAll(streamOf(json).pipeThrough(new CompressionStream('deflate-raw')), MAX_JSON);
      if (packed) return `z${toBase64Url(packed)}`;
    } catch {
      /* falls back to the plain text */
    }
  }
  return `j${toBase64Url(json)}`;
}

/** The plan's JSON value, or null when the text is not one. */
export async function decodePlanParam(code: string | null | undefined): Promise<unknown> {
  if (!code || code.length > MAX_CODE) return null;
  const bytes = fromBase64Url(code.slice(1));
  if (!bytes) return null;
  let json: Uint8Array | null = null;
  if (code[0] === 'j') json = bytes.length <= MAX_JSON ? bytes : null;
  else if (code[0] === 'z' && canCompress()) {
    try {
      json = await readAll(streamOf(bytes).pipeThrough(new DecompressionStream('deflate-raw')), MAX_JSON);
    } catch {
      return null;
    }
  }
  if (!json) return null;
  try {
    return JSON.parse(new TextDecoder().decode(json));
  } catch {
    return null;
  }
}
