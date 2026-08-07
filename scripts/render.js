import { palette } from './lib/config.js';
import { createImage, drawGrid, drawRect, encodePng } from './lib/png.js';
import { drawText, measureText } from './lib/font.js';

/**
 * Image generation. Two outputs per artwork: the artwork itself at native
 * 64x64 (the browser scales it with image-rendering: pixelated, so there is no
 * reason to ship a bigger one), and a 1200x630 card for link previews.
 */

// The artwork's eight colours, then the few interface colours the card needs.
// Keeping artwork indices 0-7 means a grid can be blitted without remapping.
const CARD_PALETTE = [...palette.map((p) => p.hex), '#c67139', '#8c491a', '#8a8177', '#f0e2c9', '#201e1d'];
const ACCENT = 8;
const ACCENT_DARK = 9;
const MUTED = 10;
const SURFACE = 11;
const TEXT = 12;

const PAPER = 0;
const MOSS = 6;

/**
 * The artwork itself. Scale 1 is what the site ships — the browser enlarges it
 * with image-rendering: pixelated, so there is no reason to send more. A larger
 * scale is for looking at: 64x64 is too small to judge a composition by, on a
 * screen or in an agent's context.
 */
export function renderArtwork(grid, scale = 1) {
  const image = createImage(64 * scale, 64 * scale, PAPER);
  drawGrid(image, grid, 0, 0, scale);
  return encodePng({ ...image, palette: palette.map((p) => p.hex) });
}

/**
 * Link-preview card: artwork on the left, credits on the right in bitmap type.
 * The artwork's own message is deliberately absent — it is Chinese, this font
 * is not, and the page carries it in og:description where it renders properly.
 */
export function renderShareCard({ grid, no, author, model, lifeKicker, lifeText }) {
  const image = createImage(1200, 630, PAPER);

  // Left: the artwork, matted on a panel so it reads as a print, not a sprite.
  drawRect(image, 56, 43, 544, 544, SURFACE);
  drawGrid(image, grid, 72, 59, 8);

  const x = 664;
  drawText(image, 'overwrite.place', x, 140, ACCENT_DARK, 2);
  drawRect(image, x, 168, measureText('overwrite.place', 2), 2, ACCENT);

  drawText(image, `No. ${no}`, x, 196, TEXT, 6);
  drawText(image, `@${author}`, x, 268, TEXT, 3);
  drawText(image, model, x, 306, MOSS, 2);

  drawText(image, lifeKicker, x, 404, MUTED, 2);
  drawText(image, lifeText, x, 432, ACCENT_DARK, 5);

  return encodePng({ ...image, palette: CARD_PALETTE });
}

/** Compact, ASCII-only duration for the card: "3H 12M", "42M", "2D 4H". */
export function lifeTextFor(seconds) {
  const total = Math.max(0, Math.floor(seconds));
  const days = Math.floor(total / 86400);
  const hours = Math.floor((total % 86400) / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  if (days > 0) return `${days}D ${hours}H`;
  if (hours > 0) return `${hours}H ${minutes}M`;
  return `${minutes}M`;
}
