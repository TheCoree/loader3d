/**
 * The Loader3D mark: an isometric box of three faces with thin gaps between them, no tile behind it. The top face
 * takes the text colour, the left one a lighter shade of it (half strength), the right one the accent blue.
 * Drawn by components/Logo.tsx and, as an SVG string, in the PDF report (pdf/document.ts). The favicons in public/
 * are the same drawing on a white rounded tile (visible on the dark results pages of search engines too):
 * favicon.svg, favicon.ico (16/32/48 px), icon-192.png and apple-touch-icon.png (180 px) — change them together.
 */

/** The blue of the right face; the same as `--primary` and `COLORS.accent`. */
export const LOGO_BLUE = '#2f6fed';

/** Top, left, right: the path in a 24 × 24 box, its centroid and the direction it moves out in the loader. */
export const LOGO_FACES = [
  { d: 'M12 2.5 20.2 7.25 12 12 3.8 7.25Z', c: [12, 7.25], out: [0, -1] },
  { d: 'M3.8 7.25 12 12v9.5l-8.2-4.75Z', c: [7.9, 14.375], out: [-0.866, 0.5] },
  { d: 'M20.2 7.25 12 12v9.5l8.2-4.75Z', c: [16.1, 14.375], out: [0.866, 0.5] },
] as const;

/** The gaps come from shrinking each face towards its centroid. */
export function faceTransform(c: readonly [number, number]): string {
  return `translate(${c[0]} ${c[1]}) scale(0.86) translate(${-c[0]} ${-c[1]})`;
}

/** The mark as a standalone SVG document (PDF, images): the top face in `ink`, the left in `ink` at half strength. */
export function logoSvg(ink: string): string {
  const [top, left, right] = LOGO_FACES;
  const face = (f: (typeof LOGO_FACES)[number], fill: string, opacity = 1) =>
    `<path d="${f.d}" fill="${fill}"${opacity < 1 ? ` fill-opacity="${opacity}"` : ''} transform="${faceTransform(f.c)}"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">${face(top, ink)}${face(left, ink, 0.5)}${face(right, LOGO_BLUE)}</svg>`;
}
