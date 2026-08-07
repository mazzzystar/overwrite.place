import { drawRect } from './png.js';

/**
 * A 5x7 bitmap font, for burning captions into share images.
 *
 * Share images have to render identically on every build machine, which rules
 * out anything that depends on system fonts being installed. Drawing the type
 * ourselves removes that dependency entirely — and pixel type under a pixel
 * artwork is the right look anyway, in a way a webfont would not have been.
 *
 * Uppercase only, which is the convention this kind of type comes from. The
 * artwork's own 60-character message is not drawn here: it is Chinese, a
 * bitmap font cannot carry it, and it travels in the page's og:description
 * instead.
 */
const GLYPHS = {
  A: '01110 10001 10001 11111 10001 10001 10001',
  B: '11110 10001 10001 11110 10001 10001 11110',
  C: '01110 10001 10000 10000 10000 10001 01110',
  D: '11110 10001 10001 10001 10001 10001 11110',
  E: '11111 10000 10000 11110 10000 10000 11111',
  F: '11111 10000 10000 11110 10000 10000 10000',
  G: '01110 10001 10000 10111 10001 10001 01111',
  H: '10001 10001 10001 11111 10001 10001 10001',
  I: '11111 00100 00100 00100 00100 00100 11111',
  J: '00111 00010 00010 00010 00010 10010 01100',
  K: '10001 10010 10100 11000 10100 10010 10001',
  L: '10000 10000 10000 10000 10000 10000 11111',
  M: '10001 11011 10101 10101 10001 10001 10001',
  N: '10001 11001 10101 10011 10001 10001 10001',
  O: '01110 10001 10001 10001 10001 10001 01110',
  P: '11110 10001 10001 11110 10000 10000 10000',
  Q: '01110 10001 10001 10001 10101 10010 01101',
  R: '11110 10001 10001 11110 10100 10010 10001',
  S: '01111 10000 10000 01110 00001 00001 11110',
  T: '11111 00100 00100 00100 00100 00100 00100',
  U: '10001 10001 10001 10001 10001 10001 01110',
  V: '10001 10001 10001 10001 10001 01010 00100',
  W: '10001 10001 10001 10101 10101 11011 10001',
  X: '10001 10001 01010 00100 01010 10001 10001',
  Y: '10001 10001 01010 00100 00100 00100 00100',
  Z: '11111 00001 00010 00100 01000 10000 11111',
  0: '01110 10001 10011 10101 11001 10001 01110',
  1: '00100 01100 00100 00100 00100 00100 01110',
  2: '01110 10001 00001 00010 00100 01000 11111',
  3: '11111 00010 00100 00010 00001 10001 01110',
  4: '00010 00110 01010 10010 11111 00010 00010',
  5: '11111 10000 11110 00001 00001 10001 01110',
  6: '00110 01000 10000 11110 10001 10001 01110',
  7: '11111 00001 00010 00100 01000 01000 01000',
  8: '01110 10001 10001 01110 10001 10001 01110',
  9: '01110 10001 10001 01111 00001 00010 01100',
  ' ': '00000 00000 00000 00000 00000 00000 00000',
  '.': '00000 00000 00000 00000 00000 01100 01100',
  ',': '00000 00000 00000 00000 01100 01100 01000',
  ':': '00000 01100 01100 00000 01100 01100 00000',
  '-': '00000 00000 00000 11111 00000 00000 00000',
  '/': '00001 00010 00010 00100 01000 01000 10000',
  '@': '01110 10001 10111 10101 10111 10000 01110',
  '#': '01010 01010 11111 01010 11111 01010 01010',
  '!': '00100 00100 00100 00100 00100 00000 00100',
  '?': '01110 10001 00001 00010 00100 00000 00100',
  "'": '01100 01100 01000 00000 00000 00000 00000',
  '(': '00010 00100 01000 01000 01000 00100 00010',
  ')': '01000 00100 00010 00010 00010 00100 01000',
};

export const GLYPH_WIDTH = 5;
export const GLYPH_HEIGHT = 7;

const rowsFor = (char) => (GLYPHS[char] ?? GLYPHS['?']).split(' ');

/** Pixel width of `text` once drawn at `scale`. */
export function measureText(text, scale = 1, tracking = 1) {
  const chars = [...text.toUpperCase()];
  if (chars.length === 0) return 0;
  return chars.length * GLYPH_WIDTH * scale + (chars.length - 1) * tracking * scale;
}

/** Draw `text` with its top-left corner at (x, y). Returns the width drawn. */
export function drawText(image, text, x, y, index, scale = 1, tracking = 1) {
  let cursor = x;
  for (const char of [...text.toUpperCase()]) {
    const rows = rowsFor(char);
    for (let ry = 0; ry < GLYPH_HEIGHT; ry++) {
      for (let rx = 0; rx < GLYPH_WIDTH; rx++) {
        if (rows[ry][rx] === '1') {
          drawRect(image, cursor + rx * scale, y + ry * scale, scale, scale, index);
        }
      }
    }
    cursor += (GLYPH_WIDTH + tracking) * scale;
  }
  return cursor - x - tracking * scale;
}
