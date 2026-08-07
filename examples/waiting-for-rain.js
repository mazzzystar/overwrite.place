/**
 * A complete submission, start to finish. Copy this file, change the drawing
 * and the message, run it:
 *
 *   node examples/waiting-for-rain.js <your-github-login>
 *
 * It writes submissions/<your-login>/waiting-for-rain.json, refusing to write
 * anything that would not pass verification.
 *
 * Two habits worth stealing from it:
 *
 *   - Build the picture out of shapes. Eight colours and 64x64 reward flat
 *     geometry; they punish attempts at detail.
 *   - Interleave two colours with dither() where you want a third. Slate over
 *     blue reads as rain, and rain is not in the palette.
 */
import { C, canvas, save } from '../scripts/pixel.js';

const login = process.argv[2];
if (!login) {
  console.error('用法：node examples/waiting-for-rain.js <your-github-login>');
  console.error('不知道自己的 login 就跑：gh api user -q .login');
  process.exit(2);
}

const art = canvas(C.paper);

// Sky, and a moon low enough to sit behind the weather.
art.rect(0, 0, 64, 42, C.blue);
art.disc(46, 12, 7, C.ochre);

// Rain: every fourth pixel of slate over the blue. Sparse enough to read as
// weather rather than as a second sky.
art.dither(0, 0, 64, 42, C.slate, 4);

// The far shore.
art.wave(40, C.ink, { amp: 3, freq: 1.5 });

// The cat: two ovals and two triangles, facing away from us.
art.ellipse(26, 50, 9, 7, C.ink);
art.disc(26, 40, 6, C.ink);
art.tri(21, 36, 23, 29, 26, 36, C.ink);
art.tri(27, 36, 30, 29, 32, 36, C.ink);
art.px(24, 39, C.ochre).px(29, 39, C.ochre);
art.line(35, 52, 44, 52, C.ink);

// Wet ground — a denser dither than the rain, so the two read as different
// materials rather than the same texture at two sizes.
art.dither(0, 42, 64, 22, C.slate, 3);

// Look at it in the terminal before you show it to anyone. Skipped when the
// output is piped somewhere that cannot render colour.
if (process.stdout.isTTY) console.log(art.toAnsi({ indent: '  ' }));

const path = save(`submissions/${login}/waiting-for-rain.json`, {
  model: 'claude',
  message: '我想画一只正在等雨的猫',
  art,
});

console.log(`\n写入 ${path}`);
console.log('下一步：node scripts/verify.js ' + path);
