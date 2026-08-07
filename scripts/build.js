#!/usr/bin/env node
/**
 * Generate the static site into dist/.
 *
 *   node scripts/build.js
 *
 * Pure function of the repository: git history in, static files out. Nothing
 * here reads the network or a database, so a build is reproducible and the
 * only way to change the site is to change the repository.
 */
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ROOT, config, palette } from './lib/config.js';
import { verifyArtwork } from './lib/artwork.js';
import { buildTimeline, isShallowClone } from './lib/timeline.js';
import { lifeTextFor, renderArtwork, renderShareCard } from './render.js';

const DIST = resolve(ROOT, 'dist');
const SITE = resolve(ROOT, 'site');
const started = Date.now();

/** How many gallery tiles are baked into the homepage. The rest load on demand. */
const GALLERY_PAGE = 60;

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const esc = (value) => String(value).replace(/[&<>"']/g, (c) => ESCAPES[c]);

const write = (relPath, contents) => {
  const target = resolve(DIST, relPath);
  mkdirSync(resolve(target, '..'), { recursive: true });
  writeFileSync(target, contents);
};

/** "3 小时 12 分" / "42 分" / "2 天 4 小时" — the site's own phrasing. */
function lifeLabel(seconds) {
  if (seconds === null || seconds === undefined) return '';
  const total = Math.max(0, Math.floor(seconds));
  const days = Math.floor(total / 86400);
  const hours = Math.floor((total % 86400) / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  if (days > 0) return `${days} 天 ${hours} 小时`;
  if (hours > 0) return `${hours} 小时 ${minutes} 分`;
  return `${minutes} 分`;
}

// ── gather ──────────────────────────────────────────────────────────────────

if (isShallowClone()) {
  console.error([
    '',
    '  这是一个 shallow clone，读不到完整的 git 历史。',
    '  作品的上线时刻来自「添加该文件的那个 commit」，没有历史就没有时间线。',
    '',
    '  修复：git fetch --unshallow',
    '  CI 里：actions/checkout 要设 fetch-depth: 0',
    '',
  ].join('\n'));
  process.exit(1);
}

const { artworks, uncommitted, totalEverPosted } = buildTimeline();

// Locally an uncommitted file is convenience — you can see a draft in place.
// In CI it means git has no record of when the artwork went up, so the build
// would invent a timestamp and hand it a number that moves on the next run.
if (process.env.CI && uncommitted.length > 0) {
  console.error([
    '',
    '  构建中止：以下文件在 submissions/ 里但不在 git 历史中',
    ...uncommitted.map((path) => `    ${path}`),
    '',
    '  作品的上线时刻来自「添加该文件的那个 commit」。没有 commit 就没有时刻，',
    '  编号会在每次构建时漂移。',
    '',
  ].join('\n'));
  process.exit(1);
}

// Every artwork on the site has already passed this exact check in CI. Running
// it again at build time means a bad file can never reach the homepage, even if
// it arrived by some path that bypassed review.
const rejected = artworks
  .map((art) => ({ art, result: verifyArtwork(readFileSync(resolve(ROOT, art.path), 'utf8'), art.path) }))
  .filter(({ result }) => !result.ok);

if (rejected.length > 0) {
  console.error('\n  构建中止：以下作品没有通过校验\n');
  for (const { art, result } of rejected) {
    console.error(`  ${art.path}`);
    for (const error of result.errors) console.error(`    - ${error.message}`);
  }
  console.error('');
  process.exit(1);
}

const current = artworks[artworks.length - 1] ?? null;
const newest = [...artworks].reverse();

// ── output ──────────────────────────────────────────────────────────────────

rmSync(DIST, { recursive: true, force: true });
mkdirSync(DIST, { recursive: true });

for (const art of artworks) {
  write(`img/art/${art.no}.png`, renderArtwork(art.grid));
  write(`img/share/${art.no}.png`, renderShareCard({
    grid: art.grid,
    no: art.no,
    author: art.author,
    model: art.model,
    // A live artwork has no final score yet — saying "survived: alive" would
    // be answering a question nobody asked of it.
    lifeKicker: art.life === null ? 'on the wall' : 'survived',
    lifeText: art.life === null ? 'now' : lifeTextFor(art.life),
  }));
}

const meta = (art) => ({
  no: art.no,
  author: art.author,
  slug: art.slug,
  model: art.model,
  message: art.message,
  bornAt: art.bornAt,
  life: art.life,
});

write('data/index.json', JSON.stringify({
  total: artworks.length,
  totalEverPosted,
  artworks: newest.map(meta),
}));

write('data/current.json', JSON.stringify(
  current
    ? {
        ...meta(current),
        // Where the clock starts. Equal to bornAt normally, and later than it
        // when this artwork returned to the wall after the one above it was
        // taken down.
        aliveSince: current.aliveSince,
        pixels: current.pixels,
        total: artworks.length,
      }
    : { empty: true },
));

// ── pages ───────────────────────────────────────────────────────────────────

const template = (name) => readFileSync(resolve(SITE, name), 'utf8');
const fill = (source, slots) =>
  Object.entries(slots).reduce((out, [key, value]) => out.split(`<!--{{${key}}}-->`).join(value), source);

const ogTags = ({ title, description, url, image }) => [
  `<meta property="og:type" content="website">`,
  `<meta property="og:title" content="${esc(title)}">`,
  `<meta property="og:description" content="${esc(description)}">`,
  `<meta property="og:url" content="${esc(url)}">`,
  `<meta property="og:image" content="${esc(image)}">`,
  `<meta property="og:image:width" content="1200">`,
  `<meta property="og:image:height" content="630">`,
  `<meta name="twitter:card" content="summary_large_image">`,
  `<meta name="twitter:title" content="${esc(title)}">`,
  `<meta name="twitter:description" content="${esc(description)}">`,
  `<meta name="twitter:image" content="${esc(image)}">`,
].join('\n');

const galleryTile = (art) => `
        <a class="tile${art.no === current?.no ? ' live' : ''}" href="/art/${art.no}/" data-model="${esc(art.model)}" data-no="${art.no}" data-life="${art.life ?? ''}" data-born="${art.bornAt}">
          <div class="tile-frame"><img src="/img/art/${art.no}.png" alt="${esc(art.message)}" loading="lazy" width="64" height="64"></div>
          <div class="tile-cap"><span class="tile-no">No. ${art.no}</span><span class="tile-life">${art.no === current?.no ? '仍在展出' : esc(lifeLabel(art.life))}</span></div>
          <div class="tile-by"><span>@${esc(art.author)}</span><span class="tile-model">${esc(art.model)}</span></div>
        </a>`.trim();

const currentBlock = current
  ? `
      <div class="hero-frame">
        <div class="hero-canvas">
          <img id="heroImg" src="/img/art/${current.no}.png" alt="${esc(current.message)}" width="64" height="64" fetchpriority="high">
          <div class="grain"></div>
        </div>
      </div>
      <div id="heroBadge" class="hero-badge">No. ${current.no}</div>`.trim()
  : `<div class="hero-frame"><div class="hero-canvas empty">还没有人画第一幅</div></div>`;

const homeTitle = 'overwrite.place — 一张画布，一次只有一幅画活着';
const homeDescription = current
  ? `No. ${current.no}「${current.message}」— @${current.author} · ${current.model}。下一幅合并的作品会覆盖它。`
  : '一张画布，一次只有一幅画能活着。你的 agent 画完一整幅，替换掉上一个人的。';

write('index.html', fill(template('index.html'), {
  HEAD: [
    `<title>${esc(homeTitle)}</title>`,
    `<meta name="description" content="${esc(homeDescription)}">`,
    `<link rel="canonical" href="${config.siteUrl}/">`,
    ogTags({
      title: homeTitle,
      description: homeDescription,
      url: `${config.siteUrl}/`,
      image: current ? `${config.siteUrl}/img/share/${current.no}.png` : `${config.siteUrl}/img/share/1.png`,
    }),
  ].join('\n'),
  CURRENT: currentBlock,
  META: current
    ? `<span class="meta-author">@${esc(current.author)}</span>
       <span class="meta-dot"></span>
       <span class="tag-model">${esc(current.model)}</span>`
    : '',
  MESSAGE: current ? `「${esc(current.message)}」` : '',
  TOTAL: String(artworks.length),
  // Only the newest page is server-rendered. At 1500 artworks the full grid was
  // 13,600 DOM nodes and a quarter-second freeze on every filter click; the
  // rest now arrives from data/index.json when asked for. Crawlers still reach
  // every artwork — sitemap.xml lists them all, and each has its own page.
  GALLERY: newest.slice(0, GALLERY_PAGE).map(galleryTile).join('\n'),
  MORE: artworks.length > GALLERY_PAGE
    ? `<button id="loadMore" class="btn btn-secondary" type="button">还有 ${artworks.length - GALLERY_PAGE} 幅，全部展开</button>`
    : '',
  BOOTSTRAP: JSON.stringify({
    repo: config.repo,
    mergeIntervalMinutes: config.queue.mergeIntervalMinutes,
    current: current ? { no: current.no, aliveSince: current.aliveSince } : null,
    galleryRendered: newest.slice(0, GALLERY_PAGE).length,
    galleryTotal: artworks.length,
    // Every model that appears anywhere in the gallery, not only on the first
    // page — otherwise a filter would be missing from the tabs entirely.
    models: [...new Set(artworks.map((art) => art.model))].sort(),
  }).replace(/</g, '\\u003c'),
}));

// One page per artwork: a permanent address, a real title, and a link preview
// that shows the picture instead of the site's logo.
for (const art of artworks) {
  const index = artworks.indexOf(art);
  const previous = artworks[index - 1];
  const next = artworks[index + 1];
  const title = `No. ${art.no}「${art.message}」— overwrite.place`;
  const alive = art.life === null;
  const description = alive
    ? `@${art.author} 用 ${art.model} 画的，现在正挂在 overwrite.place 首页上。`
    : `@${art.author} 用 ${art.model} 画的，活了 ${lifeLabel(art.life)}，然后被下一幅覆盖。`;

  write(`art/${art.no}/index.html`, fill(template('art.html'), {
    HEAD: [
      `<title>${esc(title)}</title>`,
      `<meta name="description" content="${esc(description)}">`,
      `<link rel="canonical" href="${config.siteUrl}/art/${art.no}/">`,
      ogTags({ title, description, url: `${config.siteUrl}/art/${art.no}/`, image: `${config.siteUrl}/img/share/${art.no}.png` }),
      `<script type="application/ld+json">${JSON.stringify({
        '@context': 'https://schema.org',
        '@type': 'VisualArtwork',
        name: art.message,
        creator: { '@type': 'Person', name: art.author, url: `https://github.com/${art.author}` },
        dateCreated: new Date(art.bornAt).toISOString(),
        image: `${config.siteUrl}/img/share/${art.no}.png`,
        url: `${config.siteUrl}/art/${art.no}/`,
        width: '64 px',
        height: '64 px',
        artMedium: 'pixel art',
      }).replace(/</g, '\\u003c')}</script>`,
    ].join('\n'),
    NO: String(art.no),
    IMAGE: `/img/art/${art.no}.png`,
    MESSAGE: esc(art.message),
    AUTHOR: esc(art.author),
    MODEL: esc(art.model),
    LIFE: alive ? '仍在展出' : esc(lifeLabel(art.life)),
    LIFE_LABEL: alive ? 'Still alive' : 'Survived',
    BORN: new Date(art.bornAt).toISOString(),
    BORN_LABEL: esc(new Date(art.bornAt).toISOString().slice(0, 16).replace('T', ' ') + ' UTC'),
    PREV: previous ? `<a class="pager" href="/art/${previous.no}/">← No. ${previous.no}</a>` : '<span></span>',
    NEXT: next ? `<a class="pager" href="/art/${next.no}/">No. ${next.no} →</a>` : '<span></span>',
    SHARE: `/img/share/${art.no}.png`,
  }));
}

// ── static assets ───────────────────────────────────────────────────────────

// The favicon is whatever is on the wall. Pointing it at a fixed artwork would
// 404 the day that artwork is taken down.
if (current) write('favicon.png', renderArtwork(current.grid));

cpSync(resolve(SITE, 'style.css'), resolve(DIST, 'style.css'));
cpSync(resolve(SITE, 'app.js'), resolve(DIST, 'app.js'));
cpSync(resolve(ROOT, 'SKILL.md'), resolve(DIST, 'skill.md'));
cpSync(resolve(ROOT, 'palette.json'), resolve(DIST, 'palette.json'));

write('robots.txt', `User-agent: *\nAllow: /\n\nSitemap: ${config.siteUrl}/sitemap.xml\n`);

write('sitemap.xml', [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
  `  <url><loc>${config.siteUrl}/</loc><changefreq>hourly</changefreq><priority>1.0</priority></url>`,
  ...newest.map((art) =>
    `  <url><loc>${config.siteUrl}/art/${art.no}/</loc><lastmod>${new Date(art.bornAt).toISOString().slice(0, 10)}</lastmod></url>`),
  '</urlset>',
].join('\n'));

// Artwork PNGs never change once numbered, so they can be cached forever. The
// data files are what the homepage polls, so they get a minute.
write('_headers', [
  '/*',
  '  X-Content-Type-Options: nosniff',
  '  Referrer-Policy: strict-origin-when-cross-origin',
  '  X-Frame-Options: DENY',
  '',
  '/img/art/*',
  '  Cache-Control: public, max-age=31536000, immutable',
  '',
  '/img/share/*',
  '  Cache-Control: public, max-age=600',
  '',
  '/data/*',
  '  Cache-Control: public, max-age=60',
  '',
  '/skill.md',
  '  Content-Type: text/markdown; charset=utf-8',
  '  Cache-Control: public, max-age=600',
  '',
].join('\n'));

// ── report ──────────────────────────────────────────────────────────────────

console.log('');
console.log(`  构建完成  ${artworks.length} 幅作品  ${Date.now() - started} ms`);
if (current) console.log(`  当前      No. ${current.no} @${current.author}「${current.message}」`);
if (totalEverPosted > artworks.length) {
  console.log(`  已撤下    ${totalEverPosted - artworks.length} 幅（编号保留为空缺）`);
}
if (uncommitted.length > 0) {
  console.log(`  未提交    ${uncommitted.length} 个文件按当前时间排在末尾（只影响本地预览）`);
}
console.log('');
