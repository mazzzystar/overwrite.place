import { palette } from './config.js';

const rgb = (hex) => [
  parseInt(hex.slice(1, 3), 16),
  parseInt(hex.slice(3, 5), 16),
  parseInt(hex.slice(5, 7), 16),
];

/**
 * Draw the grid in a truecolor terminal. Each character cell carries two pixel
 * rows — the upper half block is painted in the foreground colour and the rest
 * of the cell shows through as background — so a 64x64 artwork lands in 32
 * lines at its true aspect ratio.
 */
export function renderAnsi(grid, { indent = '  ' } = {}) {
  const colors = palette.map((p) => rgb(p.hex));
  const lines = [];

  for (let y = 0; y < grid.length; y += 2) {
    let line = indent;
    for (let x = 0; x < grid[y].length; x++) {
      const [tr, tg, tb] = colors[grid[y][x]] ?? colors[0];
      const [br, bg, bb] = colors[(grid[y + 1] ?? grid[y])[x]] ?? colors[0];
      line += `\x1b[38;2;${tr};${tg};${tb};48;2;${br};${bg};${bb}m▀`;
    }
    lines.push(`${line}\x1b[0m`);
  }
  return lines.join('\n');
}
