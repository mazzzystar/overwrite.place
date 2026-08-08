/**
 * The wall: one fixed square holding every artwork the site remembers.
 *
 * The occupier takes a 3/4 × 3/4 corner — 56% of the wall, nine times the
 * largest square any dead artwork can hold. Occupation is measured in raw
 * area. The dead fill the remaining L-shape with squares sized by how long
 * they held the wall, down to a floor; whoever the floor cannot fit is
 * remembered in the gallery instead, behind a "+N" cell. Cells no artwork
 * has claimed are flat colour fields — the wall opens as a Mondrian painting
 * and the artworks overwrite it one square at a time.
 *
 * This file runs in two places and must stay dependency-free: the build
 * imports it to server-render the homepage, and the browser imports the same
 * bytes (copied to /wall.js) to rehang the wall when an overwrite lands.
 * Layout is a pure function of (artworks, options); the seed is the live
 * artwork's number, so every conqueror rearranges the museum — and both sides
 * agree on the arrangement without talking to each other.
 */

export const WALL_DESKTOP = { minSize: 1 / 32, maxTiles: Infinity };
// A 1/32 cell on a phone is a smudge. Raise the floor, show the top ~40.
export const WALL_MOBILE = { minSize: 1 / 16, maxTiles: 40 };

/** Empty-cell palette: mostly paper, sparse riso accents — Mondrian's ratio. */
const FIELDS = ['#FAF6EF', '#FAF6EF', '#FAF6EF', '#FAF6EF', '#FAF6EF', '#D94F2E', '#E8A83A', '#29517E', '#5F8C46'];

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Lifespan rank → side length, always far below the occupier's 3/4. The
 *  L-shape holds 7/16 of the wall, so the classes are tighter than they look:
 *  three quarter-squares, six eighths, twenty-four sixteenths, then the floor. */
const sizeForRank = (rank) => (rank < 3 ? 1 / 4 : rank < 9 ? 1 / 8 : rank < 33 ? 1 / 16 : 1 / 32);

/**
 * @param artworks [{no, life, ...}] in any order; the live one has life === null.
 * @returns {placed: [{x, y, s, art}], fields: [{x, y, s, color}],
 *           more: {x, y, s, count} | null, live}
 * Coordinates are fractions of the wall's side; every cell is a square.
 */
export function layoutWall(artworks, { minSize, maxTiles }) {
  const live = artworks.find((a) => a.life === null || a.life === undefined) ?? null;
  const dead = artworks
    .filter((a) => a !== live)
    // Ties broken by number so both ends of the wire sort identically.
    .sort((a, b) => (b.life ?? 0) - (a.life ?? 0) || a.no - b.no);

  const shownDead = dead.slice(0, Math.max(0, maxTiles - 1));
  let overflow = dead.length - shownDead.length;

  const rng = mulberry32(live ? live.no : artworks.length + 1);
  let free = [];
  const placed = [];

  if (live) {
    // The throne is fixed: top-right, always. The dead fill the L along the
    // left and bottom — reading order walks the graveyard and lands on the
    // occupier. Only the L reshuffles between reigns.
    const lx = 0.25;
    const ly = 0;
    placed.push({ x: lx, y: ly, s: 0.75, art: live });
    for (let i = 0; i < 4; i++) {
      for (let j = 0; j < 4; j++) {
        const x = i * 0.25;
        const y = j * 0.25;
        const insideLive = x >= lx && x < lx + 0.75 && y >= ly && y < ly + 0.75;
        if (!insideLive) free.push({ x, y, s: 0.25 });
      }
    }
  } else {
    free.push({ x: 0, y: 0, s: 0.5 }, { x: 0.5, y: 0, s: 0.5 }, { x: 0, y: 0.5, s: 0.5 }, { x: 0.5, y: 0.5, s: 0.5 });
  }

  // A sparse wall scatters so the fields breathe between artworks; a crowded
  // one takes the tightest fit, or fragmentation eats the capacity.
  const scatter = artworks.length < 60;

  const place = (art, s) => {
    const fits = free.filter((c) => c.s >= s);
    if (fits.length === 0) return false;
    let pick = fits;
    if (!scatter) {
      const smallest = Math.min(...fits.map((c) => c.s));
      pick = fits.filter((c) => c.s === smallest);
    }
    let cell = pick[Math.floor(rng() * pick.length)];
    free = free.filter((c) => c !== cell);
    while (cell.s > s) {
      const half = cell.s / 2;
      const subs = [
        { x: cell.x, y: cell.y, s: half },
        { x: cell.x + half, y: cell.y, s: half },
        { x: cell.x, y: cell.y + half, s: half },
        { x: cell.x + half, y: cell.y + half, s: half },
      ];
      cell = subs.splice(Math.floor(rng() * 4), 1)[0];
      free.push(...subs);
    }
    placed.push({ ...cell, art });
    return true;
  };

  shownDead.forEach((art, rank) => {
    const s = Math.max(sizeForRank(rank), minSize);
    if (!place(art, s) && !place(art, minSize)) overflow++;
  });

  // The overflow needs a door, and the door takes a cell: evict the
  // shortest-lived tile on the wall and let its square point at the gallery.
  let more = null;
  if (overflow > 0 && placed.length > 1) {
    const evicted = placed.pop();
    overflow++;
    more = { x: evicted.x, y: evicted.y, s: evicted.s, count: overflow };
  }

  const fields = free.map((c) => ({ ...c, color: FIELDS[Math.floor(rng() * FIELDS.length)] }));
  return { placed, fields, more, live };
}
