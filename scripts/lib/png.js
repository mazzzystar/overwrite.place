import { deflateSync } from 'node:zlib';

/**
 * Minimal indexed-colour PNG encoder.
 *
 * Every image this project produces is flat 8-colour pixel art, which is
 * exactly what PNG's palette mode was designed for. Encoding it directly costs
 * about eighty lines and buys the whole repository zero production
 * dependencies — no native binary that can fail to install on a build machine,
 * and no supply-chain surface on a repository that accepts pull requests from
 * strangers.
 */

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buffer) {
  let c = -1;
  for (let i = 0; i < buffer.length; i++) c = CRC_TABLE[(c ^ buffer[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type, data) {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, 'ascii');
  data.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}

const rgb = (hex) => [
  parseInt(hex.slice(1, 3), 16),
  parseInt(hex.slice(3, 5), 16),
  parseInt(hex.slice(5, 7), 16),
];

/**
 * @param {{width:number,height:number,indices:Uint8Array,palette:string[]}} image
 *        `indices` is row-major, one palette index per pixel.
 */
export function encodePng({ width, height, indices, palette }) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 3;  // colour type 3 — indexed
  // bytes 10-12 stay zero: deflate, adaptive filtering, no interlace

  const plte = Buffer.alloc(palette.length * 3);
  palette.forEach((hex, i) => {
    const [r, g, b] = rgb(hex);
    plte[i * 3] = r;
    plte[i * 3 + 1] = g;
    plte[i * 3 + 2] = b;
  });

  // One filter byte per scanline. Filter 0 (none) is right here: flat regions
  // of identical palette indices are what deflate compresses best, and the
  // usual predictive filters would only add noise to that.
  const raw = Buffer.alloc((width + 1) * height);
  for (let y = 0; y < height; y++) {
    const offset = y * (width + 1);
    raw[offset] = 0;
    for (let x = 0; x < width; x++) raw[offset + 1 + x] = indices[y * width + x];
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('PLTE', plte),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** A blank indexed image, filled with one palette index. */
export function createImage(width, height, fill = 0) {
  return { width, height, indices: new Uint8Array(width * height).fill(fill) };
}

export function drawRect(image, x0, y0, w, h, index) {
  for (let y = Math.max(0, y0); y < Math.min(image.height, y0 + h); y++) {
    for (let x = Math.max(0, x0); x < Math.min(image.width, x0 + w); x++) {
      image.indices[y * image.width + x] = index;
    }
  }
}

/** Blit a 64x64 grid at an integer scale — nearest neighbour, no resampling. */
export function drawGrid(image, grid, x0, y0, scale) {
  for (let gy = 0; gy < grid.length; gy++) {
    for (let gx = 0; gx < grid[gy].length; gx++) {
      drawRect(image, x0 + gx * scale, y0 + gy * scale, scale, scale, grid[gy][gx]);
    }
  }
}
