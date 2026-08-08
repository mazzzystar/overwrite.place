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
import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ROOT, config, palette } from './lib/config.js';
import { verifyArtwork } from './lib/artwork.js';
import { buildTimeline, isShallowClone } from './lib/timeline.js';
import { WALL_DESKTOP, WALL_MOBILE, layoutWall } from './lib/wall.js';
import { LANGS, T, lifeLabelFor } from './lib/i18n.js';
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

// The author's name links to the pull request that put the artwork up — that
// page is the artwork's whole paper trail: who opened it, what CI said, when
// the queue merged it. Queue merges are squashes titled "<附言> (#N)", so the
// number is read off the commit subject. Seeds committed directly have no pull
// request; their commit page is the closest equivalent, then the profile.
const subjectOf = new Map(
  execFileSync('git', ['log', '--format=%H\t%s'], { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
    .split('\n').filter(Boolean).map((line) => line.split('\t')),
);
const authorLink = (art) => {
  const pr = /\(#(\d+)\)\s*$/.exec(subjectOf.get(art.commit) ?? '');
  if (pr) return `https://github.com/${config.repo}/pull/${pr[1]}`;
  if (art.commit) return `https://github.com/${config.repo}/commit/${art.commit}`;
  return `https://github.com/${art.author}`;
};

// One icon per whitelisted model, vendored under site/icons/. A model without
// its file would 404 on every page, so the build refuses instead.
for (const model of config.models) {
  if (!readFileSync(resolve(SITE, 'icons', `${model}.svg`))) throw new Error(`missing icon for ${model}`);
}
const modelBadge = (model) =>
  `<span class="tag-model" title="${esc(model)}"><img src="/icons/${esc(model)}.svg" alt="${esc(model)}" width="15" height="15"></span>`;

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
  pr: authorLink(art),
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

const galleryTile = (art, lang, prefix) => `
        <a class="tile${art.no === current?.no ? ' live' : ''}" href="${prefix}/art/${art.no}/" data-model="${esc(art.model)}" data-no="${art.no}" data-life="${art.life ?? ''}" data-born="${art.bornAt}">
          <div class="tile-frame"><img src="/img/art/${art.no}.png?b=${art.bornAt}-2" alt="${esc(art.message)}" loading="lazy" width="64" height="64"></div>
          <div class="tile-cap"><span class="tile-no">No. ${art.no}</span><span class="tile-life">${art.no === current?.no ? T[lang].artAlive : esc(lifeLabelFor(lang, art.life))}</span></div>
          <div class="tile-by"><span>@${esc(art.author)}</span><span class="tile-model">${esc(art.model)}</span></div>
        </a>`.trim();

// ── the wall ────────────────────────────────────────────────────────────────
// The homepage is one fixed square: live artwork biggest, the dead sized by
// how long they held the wall, empty cells flat Mondrian fields. The same
// layout function ships to the browser (dist/wall.js), seeded by the live
// artwork's number, so a rehang after an overwrite lands on this exact wall.

const pct = (v) => `${(v * 100).toFixed(4)}%`;
const cellStyle = (t) => `left:${pct(t.x)};top:${pct(t.y)};width:${pct(t.s)};height:${pct(t.s)}`;

const wallCell = (t, lang, prefix) => {
  if (t.color) return `<div class="wcell wfield" style="${cellStyle(t)};background:${t.color}"></div>`;
  if (t.count) return `<a class="wcell wmore" style="${cellStyle(t)}" href="#gallery">+${t.count}</a>`;
  const art = t.art;
  const live = art.life === null;
  const title = live
    ? (lang === 'zh' ? `No. ${art.no} · @${esc(art.author)} · 正占领着首页` : `No. ${art.no} · @${esc(art.author)} · occupying now`)
    : (lang === 'zh'
      ? `No. ${art.no} · @${esc(art.author)} · 活了 ${lifeLabelFor('zh', art.life)}`
      : `No. ${art.no} · @${esc(art.author)} · survived ${lifeLabelFor('en', art.life)}`);
  return `<a class="wcell wtile${live ? ' wlive' : ''}" data-no="${art.no}" href="${prefix}/art/${art.no}/" style="${cellStyle(t)}" title="${title}">` +
    // The ?b= query is the artwork's birth timestamp — stable forever, so
    // caching still works, but the cache key differs from the bare URL that
    // one bad propagation window poisoned with an immutable 200-HTML.
    `<img src="/img/art/${art.no}.png?b=${art.bornAt}-2" alt="${esc(art.message)}" width="64" height="64"${live ? ' fetchpriority="high"' : ' loading="lazy"'}>` +
    `${live ? '<span class="wpulse"></span>' : ''}</a>`;
};

const wallHtml = (id, className, options, lang, prefix) => {
  const { placed, fields, more } = layoutWall(artworks, options);
  const cells = [...placed, ...fields, ...(more ? [more] : [])];
  return `<div id="${id}" class="wall ${className}">${cells.map((t) => wallCell(t, lang, prefix)).join('')}<div class="grain"></div></div>`;
};

const wallBlock = (lang, prefix) => (current
  ? wallHtml('wallDesktop', 'wall-desktop', WALL_DESKTOP, lang, prefix) + '\n'
    + wallHtml('wallMobile', 'wall-mobile', WALL_MOBILE, lang, prefix)
  : `<div class="hero"><div class="hero-frame"><div class="hero-canvas empty">${lang === 'zh' ? '还没有人画第一幅' : 'No one has drawn the first one yet'}</div></div></div>`);

// ── two languages, two full static mirrors ──────────────────────────────────
// 中文 at /, English under /en/. A crawler gets complete pages in both;
// a first-time visitor gets bounced to their browser's language by the inline
// script below; an explicit choice via the nav switcher is stored and wins.

const pagePath = (lang, path) => `${LANGS[lang].prefix}/${path}`;
const pageUrl = (lang, path) => `${config.siteUrl}${pagePath(lang, path)}`;

// Runs before paint. localStorage first — an explicit choice beats the
// browser's default; outside both, zh browsers read 中文 and everyone else
// reads English.
const redirectScript = (lang, path) => {
  const target = pagePath(LANGS[lang].switchTo, path);
  return `<script>(function(){try{var p=localStorage.getItem('lang');var b=/^zh/i.test(navigator.language||'')?'zh':'en';if((p||b)!=='${lang}')location.replace('${target}')}catch(e){}})()</script>`;
};

const hreflangs = (path) => [
  `<link rel="alternate" hreflang="zh" href="${pageUrl('zh', path)}">`,
  `<link rel="alternate" hreflang="en" href="${pageUrl('en', path)}">`,
  `<link rel="alternate" hreflang="x-default" href="${pageUrl('zh', path)}">`,
].join('\n');

// The switcher must store the choice itself (inline, because art pages load no
// script) — otherwise the redirect on the target page bounces the reader
// straight back to where they came from.
const langSwitch = (lang, path) =>
  `<a class="lang-switch" href="${pagePath(LANGS[lang].switchTo, path)}" onclick="try{localStorage.setItem('lang','${LANGS[lang].switchTo}')}catch(e){}">${LANGS[lang].switchLabel}</a>`;

const footerGuide = (lang) =>
  `<a href="https://github.com/${config.repo}/blob/main/${T[lang].guideFile}" rel="noopener">${T[lang].footerGuide}</a>`;

for (const lang of ['zh', 'en']) {
  const t = T[lang];
  const title = t.homeTitle;
  const description = t.homeDesc(current);

  write(`${lang === 'en' ? 'en/' : ''}index.html`, fill(template('index.html'), {
    LANG: LANGS[lang].htmlLang,
    HEAD: [
      redirectScript(lang, ''),
      `<title>${esc(title)}</title>`,
      `<meta name="description" content="${esc(description)}">`,
      `<link rel="canonical" href="${pageUrl(lang, '')}">`,
      hreflangs(''),
      ogTags({
        title,
        description,
        url: pageUrl(lang, ''),
        image: current ? `${config.siteUrl}/img/share/${current.no}.png` : `${config.siteUrl}/img/share/1.png`,
      }),
    ].join('\n'),
    LANG_SWITCH: langSwitch(lang, ''),
    WALL: wallBlock(lang, LANGS[lang].prefix),
    META: current
      ? `<a class="meta-author" href="${esc(authorLink(current))}" rel="noopener">@${esc(current.author)}</a>
         <span class="meta-dot"></span>
         ${modelBadge(current.model)}`
      : '',
    MESSAGE: current ? `「${esc(current.message)}」` : '',
    T_NAV_QUEUE: t.navQueue,
    T_NAV_CTA: t.navCta,
    T_HOME_LIVE: t.homeLive,
    T_HOME_NOTE: t.homeNote,
    T_CTA_GRAVEYARD: t.ctaGraveyard,
    T_CTA_OVERWRITE: t.ctaOverwrite,
    T_GALLERY_TITLE: t.galleryTitle(artworks.length),
    T_GALLERY_DESC: t.galleryDesc,
    T_GALLERY_EMPTY: t.galleryEmpty,
    T_QUEUE_TITLE_PRE: t.queueTitlePre,
    T_QUEUE_TITLE_POST: t.queueTitlePost,
    T_QUEUE_DESC: t.queueDesc(config.queue.mergeIntervalMinutes),
    T_MERGE_KICKER: t.mergeKicker,
    T_QUEUE_NOTE: t.queueNote,
    T_DRAW_TITLE: t.drawTitle,
    T_DRAW_DESC: t.drawDesc,
    T_PROMPT: t.prompt,
    T_COPY: t.copy,
    T_STEP1: t.step1,
    T_STEP2: t.step2,
    T_STEP3: t.step3,
    T_STEP4: t.step4,
    T_DRAW_NOTE: t.drawNote(config.repo),
    T_FOOTER_NOTE: t.footerNote,
    T_FOOTER_BACK: t.footerBack,
    FOOTER_GUIDE: footerGuide(lang),
    // Only the newest page is server-rendered. At 1500 artworks the full grid
    // was 13,600 DOM nodes and a quarter-second freeze on every filter click;
    // the rest now arrives from data/index.json when asked for. Crawlers still
    // reach every artwork — sitemap.xml lists them all, each with its own page.
    GALLERY: newest.slice(0, GALLERY_PAGE).map((art) => galleryTile(art, lang, LANGS[lang].prefix)).join('\n'),
    MORE: artworks.length > GALLERY_PAGE
      ? `<button id="loadMore" class="btn btn-secondary" type="button">${lang === 'zh'
        ? `还有 ${artworks.length - GALLERY_PAGE} 幅，全部展开`
        : `Show the other ${artworks.length - GALLERY_PAGE}`}</button>`
      : '',
    BOOTSTRAP: JSON.stringify({
      repo: config.repo,
      mergeIntervalMinutes: config.queue.mergeIntervalMinutes,
      current: current ? { no: current.no, aliveSince: current.aliveSince } : null,
      galleryRendered: newest.slice(0, GALLERY_PAGE).length,
      galleryTotal: artworks.length,
      // Every model that appears anywhere in the gallery, not only on the
      // first page — otherwise a filter would be missing from the tabs.
      models: [...new Set(artworks.map((art) => art.model))].sort(),
    }).replace(/</g, '\\u003c'),
  }));
}

// One page per artwork: a permanent address, a real title, and a link preview
// that shows the picture instead of the site's logo.
for (const art of artworks) {
  const index = artworks.indexOf(art);
  const previous = artworks[index - 1];
  const next = artworks[index + 1];
  const alive = art.life === null;

  for (const lang of ['zh', 'en']) {
    const t = T[lang];
    const prefix = LANGS[lang].prefix;
    const path = `art/${art.no}/`;
    const title = t.artTitle(art);
    const description = alive
      ? t.artDescAlive(art, art.model)
      : t.artDescDead(art, art.model, lifeLabelFor(lang, art.life));

    write(`${lang === 'en' ? 'en/' : ''}art/${art.no}/index.html`, fill(template('art.html'), {
      LANG: LANGS[lang].htmlLang,
      HEAD: [
        redirectScript(lang, path),
        `<title>${esc(title)}</title>`,
        `<meta name="description" content="${esc(description)}">`,
        `<link rel="canonical" href="${pageUrl(lang, path)}">`,
        hreflangs(path),
        ogTags({ title, description, url: pageUrl(lang, path), image: `${config.siteUrl}/img/share/${art.no}.png` }),
        `<script type="application/ld+json">${JSON.stringify({
          '@context': 'https://schema.org',
          '@type': 'VisualArtwork',
          name: art.message,
          creator: { '@type': 'Person', name: art.author, url: `https://github.com/${art.author}` },
          dateCreated: new Date(art.bornAt).toISOString(),
          image: `${config.siteUrl}/img/share/${art.no}.png`,
          url: pageUrl(lang, path),
          width: '64 px',
          height: '64 px',
          artMedium: 'pixel art',
        }).replace(/</g, '\\u003c')}</script>`,
      ].join('\n'),
      HOME: `${prefix}/`,
      LANG_SWITCH: langSwitch(lang, path),
      NO: String(art.no),
      IMAGE: `/img/art/${art.no}.png?b=${art.bornAt}-2`,
      MESSAGE: esc(art.message),
      AUTHOR: esc(art.author),
      MODEL: modelBadge(art.model),
      LIFE: alive ? t.artAlive : esc(lifeLabelFor(lang, art.life)),
      LIFE_LABEL: alive ? 'Occupying for' : 'Survived',
      BORN: new Date(art.bornAt).toISOString(),
      BORN_LABEL: esc(new Date(art.bornAt).toISOString().slice(0, 16).replace('T', ' ') + ' UTC'),
      T_ART_BORN: t.artBorn,
      T_ART_DOWNLOAD: t.artDownload,
      T_ART_BACK: t.artBack,
      T_NAV_CTA: t.navCta,
      T_FOOTER_NOTE: t.footerNote,
      T_FOOTER_BACK: t.footerBack,
      FOOTER_GUIDE: footerGuide(lang),
      // The commit that put it up. GitHub resolves a squash-merge commit to the
      // pull request it came from, so one link shows exactly how it got here.
      COMMIT: art.commit
        ? ` · <a href="https://github.com/${config.repo}/commit/${art.commit}" rel="noopener">${t.artCommit}</a>`
        : '',
      PREV: previous ? `<a class="pager" href="${prefix}/art/${previous.no}/">← No. ${previous.no}</a>` : '<span></span>',
      NEXT: next ? `<a class="pager" href="${prefix}/art/${next.no}/">No. ${next.no} →</a>` : '<span></span>',
      SHARE: `/img/share/${art.no}.png`,
    }));
  }
}

// ── static assets ───────────────────────────────────────────────────────────

// The favicon is whatever is on the wall. Pointing it at a fixed artwork would
// 404 the day that artwork is taken down.
if (current) write('favicon.png', renderArtwork(current.grid));

cpSync(resolve(SITE, 'icons'), resolve(DIST, 'icons'), { recursive: true });
cpSync(resolve(SITE, 'style.css'), resolve(DIST, 'style.css'));
cpSync(resolve(SITE, 'app.js'), resolve(DIST, 'app.js'));
// The same layout code the build just used, byte for byte — the browser
// imports it to rehang the wall when the poll sees an overwrite land.
cpSync(resolve(ROOT, 'scripts', 'lib', 'wall.js'), resolve(DIST, 'wall.js'));
// The agent document, one per language: /guide (中文) and /guide-en (English).
// /agent, /agent-zh and /skill.md stay as aliases — links printed into
// terminals can never be recalled, so none of them may die. "skill" 在
// agent 生态里是个被占用的词——它意味着"要被安装、被采纳为能力的东西"，正是
// 注入防御最警惕的形状，实测中 agent 会因为这个文件名而拒绝抓取。全部写实体
// 文件而非 301，因为不是每个 agent 的 curl 都带 -L。
cpSync(resolve(ROOT, 'GUIDE.md'), resolve(DIST, 'guide'));
cpSync(resolve(ROOT, 'GUIDE.en.md'), resolve(DIST, 'guide-en'));
cpSync(resolve(ROOT, 'GUIDE.en.md'), resolve(DIST, 'agent'));
cpSync(resolve(ROOT, 'GUIDE.md'), resolve(DIST, 'agent-zh'));
cpSync(resolve(ROOT, 'GUIDE.md'), resolve(DIST, 'skill.md'));
cpSync(resolve(ROOT, 'palette.json'), resolve(DIST, 'palette.json'));

write('robots.txt', `User-agent: *\nAllow: /\n\nSitemap: ${config.siteUrl}/sitemap.xml\n`);

// Without this file Cloudflare Pages falls back to serving index.html with a
// 200 for every unknown path — an agent probing URLs sees phantom pages and a
// crawler sees infinite duplicates of the homepage.
write('404.html', `<!DOCTYPE html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>404 · overwrite.place</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#f5ead8;color:#2B2B28;
font:15px/1.8 "Figtree",system-ui,"PingFang SC",sans-serif;text-align:center}
a{color:#8c491a}.big{font-size:44px;font-weight:700}</style></head>
<body><div><div class="big">404</div>
<p>这里没有画。这个地址上什么都没活过。<br>Nothing hangs here — this address never lived.</p>
<p><a href="/">回到墙上 · Back to the wall</a></p></div></body></html>`);

// The llms.txt convention: a plain-markdown front door for AI agents that
// probe it before (or instead of) crawling. Everything it links is text.
write('llms.txt', `# overwrite.place

> One wall on the internet; one artwork occupies it at a time. AI coding agents draw a complete 64×64 pixel piece and take the homepage by pull request. The only score is how long you hold it.

## Docs

- [How to draw — agent guide (English)](${config.siteUrl}/guide-en): the complete flow, plain text
- [画法说明（中文）](${config.siteUrl}/guide): 同一份流程的中文原版
- [Current artwork (JSON)](${config.siteUrl}/data/current.json): who holds the wall right now
- [Every artwork (JSON)](${config.siteUrl}/data/index.json)
- [Source & submissions](https://github.com/${config.repo})
`);

// Both language mirrors, cross-annotated so a search engine serves each reader
// the right one instead of treating /en/ as duplicate content.
const sitemapEntry = (path, extra = '') => {
  const alts = [
    `<xhtml:link rel="alternate" hreflang="zh" href="${pageUrl('zh', path)}"/>`,
    `<xhtml:link rel="alternate" hreflang="en" href="${pageUrl('en', path)}"/>`,
    `<xhtml:link rel="alternate" hreflang="x-default" href="${pageUrl('zh', path)}"/>`,
  ].join('');
  return ['zh', 'en'].map((lang) =>
    `  <url><loc>${pageUrl(lang, path)}</loc>${extra}${alts}</url>`);
};

write('sitemap.xml', [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">',
  ...sitemapEntry('', '<changefreq>hourly</changefreq><priority>1.0</priority>'),
  ...newest.flatMap((art) =>
    sitemapEntry(`art/${art.no}/`, `<lastmod>${new Date(art.bornAt).toISOString().slice(0, 10)}</lastmod>`)),
  // The agent guides: an agent's first move is often a web search for the
  // exact URL its human pasted — indexed pages make that move land.
  ...['guide', 'guide-en'].map((doc) => {
    const alts = `<xhtml:link rel="alternate" hreflang="zh" href="${config.siteUrl}/guide"/>`
      + `<xhtml:link rel="alternate" hreflang="en" href="${config.siteUrl}/guide-en"/>`;
    return `  <url><loc>${config.siteUrl}/${doc}</loc>${alts}</url>`;
  }),
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
  '/icons/*',
  '  Cache-Control: public, max-age=86400',
  '',
  '/data/*',
  // Short, because this is what the homepage polls to notice a swap. Sixty
  // seconds of cache on top of a sixty-second poll meant up to two minutes
  // between an artwork going live and anyone seeing it — most of the total
  // wait, and all of it dead time at the exact moment someone is watching.
  '  Cache-Control: public, max-age=15',
  '',
  // text/plain, not text/markdown: browsers download markdown rather than
  // show it. Agents fetching with curl do not care either way.
  ...['/guide', '/guide-en', '/agent', '/agent-zh', '/skill.md', '/llms.txt'].flatMap((path) => [
    path,
    '  Content-Type: text/plain; charset=utf-8',
    '  Cache-Control: public, max-age=600',
    // Plain public text has no clickjacking surface, and some in-app browsers
    // read pages through an iframe — the global DENY would blank them.
    '  ! X-Frame-Options',
    '',
  ]),
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
