'use strict';

/**
 * The page is server-rendered; this only adds the parts that move — the
 * survival clock, the swap when someone overwrites the current artwork, the
 * gallery filters, and the queue. Everything still reads without it.
 */

const boot = JSON.parse(document.getElementById('bootstrap').textContent);
const $ = (id) => document.getElementById(id);

const state = {
  no: boot.current ? boot.current.no : null,
  // Not bornAt: an artwork that returned to the wall after the one above it was
  // taken down starts counting from the takedown, not from its first showing.
  aliveSince: boot.current ? boot.current.aliveSince : null,
  loadedAll: boot.galleryRendered >= boot.galleryTotal,
};

// ── survival clock ──────────────────────────────────────────────────────────

function formatLife(seconds) {
  const total = Math.max(0, Math.floor(seconds));
  const days = Math.floor(total / 86400);
  const hours = Math.floor((total % 86400) / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  const pad = (n) => String(n).padStart(2, '0');
  if (days > 0) return `${days} 天 ${pad(hours)} 小时 ${pad(minutes)} 分`;
  if (hours > 0) return `${hours} 小时 ${pad(minutes)} 分 ${pad(secs)} 秒`;
  return `${minutes} 分 ${pad(secs)} 秒`;
}

function formatShort(seconds) {
  const total = Math.max(0, Math.floor(seconds));
  const days = Math.floor(total / 86400);
  const hours = Math.floor((total % 86400) / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  if (days > 0) return `${days} 天 ${hours} 小时`;
  if (hours > 0) return `${hours} 小时 ${minutes} 分`;
  return `${minutes} 分`;
}

function tickClock() {
  if (state.aliveSince === null) return;
  $('aliveText').textContent = formatLife((Date.now() - state.aliveSince) / 1000);
}

// ── the swap ────────────────────────────────────────────────────────────────

const OBITUARIES = [
  '死于一次例行合并。无痛。',
  '它撑过了午休，没撑过下班。',
  '被一个刚睡醒的 agent 顶掉了。',
  '生前无人点赞，死后进入永久馆藏。',
  '如果它半夜上线，本可以再活六小时。',
];

function showObituary(no, seconds) {
  const root = $('toastRoot');
  const toast = document.createElement('div');
  toast.className = 'toast';

  const kicker = document.createElement('div');
  kicker.className = 'toast-kicker';
  kicker.textContent = 'Obituary';

  const title = document.createElement('div');
  title.className = 'toast-title';
  title.textContent = `No. ${no} 存活了 ${formatShort(seconds)}`;

  const line = document.createElement('div');
  line.className = 'toast-line';
  line.textContent = OBITUARIES[no % OBITUARIES.length];

  toast.append(kicker, title, line);
  root.replaceChildren(toast);
  setTimeout(() => toast.remove(), 5600);
}

function swapTo(next) {
  const previousNo = state.no;
  const previousSince = state.aliveSince;

  const hero = $('hero');
  hero.style.opacity = '0';

  setTimeout(() => {
    const image = $('heroImg');
    if (image) {
      image.src = `/img/art/${next.no}.png`;
      image.alt = next.message;
    }
    const badge = $('heroBadge');
    if (badge) badge.textContent = `No. ${next.no}`;

    const author = document.querySelector('.meta-author');
    if (author) {
      author.textContent = `@${next.author}`;
      if (author.tagName === 'A') author.href = `https://github.com/${next.author}`;
    }
    const model = document.querySelector('.tag-model');
    if (model) model.textContent = next.model;
    $('message').textContent = `「${next.message}」`;

    state.no = next.no;
    state.aliveSince = next.aliveSince ?? next.bornAt;
    tickClock();
    hero.style.opacity = '1';

    if (previousNo !== null) {
      const lived = (next.bornAt - previousSince) / 1000;
      showObituary(previousNo, lived);
      markGalleryOverwritten(previousNo, lived);
    }
    prependGalleryTile(next);
    // The arriving tile has to obey the filter and sort the visitor set, and
    // its model may be one that had no tab until now.
    buildTabs();
    applyFilters();
  }, 450);
}

function markGalleryOverwritten(no, lived) {
  const tile = document.querySelector(`.tile[data-no="${no}"]`);
  if (!tile) return;
  tile.classList.remove('live');
  tile.dataset.life = String(Math.round(lived));
  const life = tile.querySelector('.tile-life');
  if (life) life.textContent = formatShort(lived);
}

/** One gallery tile. Shared by the live swap and the on-demand gallery load. */
function makeTile(art, live) {
  const tile = document.createElement('a');
  tile.className = `tile${live ? ' live' : ''}`;
  tile.href = `/art/${art.no}/`;
  tile.dataset.model = art.model;
  tile.dataset.no = String(art.no);
  tile.dataset.born = String(art.bornAt);
  tile.dataset.life = art.life === null || art.life === undefined ? '' : String(art.life);
  tile.innerHTML =
    '<div class="tile-frame"><img width="64" height="64" loading="lazy"></div>' +
    '<div class="tile-cap"><span class="tile-no"></span><span class="tile-life"></span></div>' +
    '<div class="tile-by"><span class="tile-author"></span><span class="tile-model"></span></div>';
  const image = tile.querySelector('img');
  image.src = `/img/art/${art.no}.png`;
  image.alt = art.message ?? '';
  tile.querySelector('.tile-no').textContent = `No. ${art.no}`;
  tile.querySelector('.tile-life').textContent = live ? '仍在展出' : formatShort(art.life ?? 0);
  tile.querySelector('.tile-author').textContent = `@${art.author}`;
  tile.querySelector('.tile-model').textContent = art.model;
  return tile;
}

function prependGalleryTile(art) {
  const grid = $('grid');
  if (!grid || grid.querySelector(`.tile[data-no="${art.no}"]`)) return;
  grid.prepend(makeTile(art, true));
}

/**
 * Pull in the artworks the homepage did not bake in. Only the newest page is
 * server-rendered, so filtering and sorting need the rest before they can claim
 * to cover the whole gallery.
 */
let loading = null;
function loadWholeGallery() {
  if (state.loadedAll) return Promise.resolve();
  if (loading) return loading;

  const button = $('loadMore');
  if (button) { button.disabled = true; button.textContent = '载入中…'; }

  loading = fetch('/data/index.json', { cache: 'no-store' })
    .then((response) => response.json())
    .then((data) => {
      const grid = $('grid');
      const have = new Set([...grid.querySelectorAll('.tile')].map((t) => t.dataset.no));
      const fragment = document.createDocumentFragment();
      for (const art of data.artworks) {
        if (have.has(String(art.no))) continue;
        fragment.append(makeTile(art, art.no === state.no));
      }
      grid.append(fragment);
      state.loadedAll = true;
      if (button) button.remove();
      applyFilters();
    })
    .catch(() => {
      if (button) { button.disabled = false; button.textContent = '载入失败，再试一次'; }
      loading = null;
    });

  return loading;
}

async function pollCurrent() {
  try {
    const response = await fetch('/data/current.json', { cache: 'no-store' });
    if (!response.ok) return;
    const next = await response.json();
    if (next.empty || next.no === state.no) return;
    // A lower number means the artwork on the wall was taken down and an older
    // one is back. There is no obituary to show for that, and animating it as
    // an arrival would report a negative lifespan. Take the fresh page.
    if (next.no < state.no) { window.location.reload(); return; }
    swapTo(next);
  } catch {
    // Offline or a deploy in flight. The clock keeps running; try again later.
  }
}

// ── gallery filters ─────────────────────────────────────────────────────────

const filters = { model: '全部', sort: '最新' };

function applyFilters() {
  const grid = $('grid');
  if (!grid) return;
  const tiles = [...grid.querySelectorAll('.tile')];

  let visible = 0;
  for (const tile of tiles) {
    const show = filters.model === '全部' || tile.dataset.model === filters.model;
    tile.hidden = !show;
    if (show) visible++;
  }

  const lifeOf = (tile) => (tile.classList.contains('live')
    ? (Date.now() - state.aliveSince) / 1000
    : Number(tile.dataset.life || 0));

  const ordered = [...tiles].sort(filters.sort === '最长寿'
    ? (a, b) => lifeOf(b) - lifeOf(a)
    : (a, b) => Number(b.dataset.no) - Number(a.dataset.no));

  // One mutation, not one per tile. Appending in a loop reflows the grid on
  // every iteration, which at gallery scale is the difference between instant
  // and a visible freeze.
  grid.replaceChildren(...ordered);
  $('emptyGallery').hidden = visible > 0;
}

function buildTabs() {
  const tabs = $('tabs');
  if (!tabs) return;

  // Rebuilt rather than appended to, because this runs again after a swap.
  tabs.replaceChildren();

  // The models baked in at build time, plus any that arrived since — a model
  // whose first artwork lands via the poll still needs a tab.
  const models = [...new Set([
    ...(boot.models ?? []),
    ...[...document.querySelectorAll('.tile')].map((tile) => tile.dataset.model),
  ])].filter(Boolean).sort();

  const make = (label, group) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `tab${filters[group] === label ? ' active' : ''}`;
    button.textContent = label;
    button.addEventListener('click', () => {
      filters[group] = label;
      tabs.querySelectorAll(`[data-group="${group}"]`).forEach((b) => b.classList.toggle('active', b.textContent === label));
      // A filter that only searches the newest page would quietly lie about
      // what is in the gallery, so narrowing pulls in the rest first.
      if (!state.loadedAll) loadWholeGallery();
      applyFilters();
    });
    button.dataset.group = group;
    return button;
  };

  for (const model of ['全部', ...models]) tabs.append(make(model, 'model'));
  const divider = document.createElement('span');
  divider.className = 'tab-divider';
  tabs.append(divider);
  for (const sort of ['最新', '最长寿']) tabs.append(make(sort, 'sort'));
}

// ── queue ───────────────────────────────────────────────────────────────────

/**
 * How long until the queue may release. Not a clock tick — the interval is a
 * floor under the *current* artwork's life, so once it has had its minutes the
 * next one goes up as soon as it is verified.
 */
function nextMergeIn() {
  if (state.aliveSince === null) return 0;
  return Math.max(0, state.aliveSince + boot.mergeIntervalMinutes * 60_000 - Date.now());
}

function tickMergeClock() {
  const node = $('nextMerge');
  if (!node) return;
  const remaining = nextMergeIn();
  if (remaining <= 0) {
    node.textContent = '随时';
    return;
  }
  const mm = String(Math.floor(remaining / 60_000)).padStart(2, '0');
  const ss = String(Math.floor(remaining / 1000) % 60).padStart(2, '0');
  node.textContent = `${mm}:${ss}`;
}

async function loadQueue() {
  const list = $('queueList');
  if (!list) return;

  try {
    const response = await fetch(`https://api.github.com/repos/${boot.repo}/pulls?state=open&per_page=100`, {
      headers: { accept: 'application/vnd.github+json' },
    });
    if (!response.ok) throw new Error(String(response.status));

    const verified = (await response.json())
      .filter((pr) => pr.labels.some((label) => label.name === 'verified'))
      .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

    $('queueCount').textContent = String(verified.length);

    if (verified.length === 0) {
      list.replaceChildren(Object.assign(document.createElement('p'), {
        className: 'queue-empty',
        textContent: '现在没有人排队。下一个提交的作品会直接上线。',
      }));
      return;
    }

    list.replaceChildren(...verified.map((pr, i) => {
      const row = document.createElement('a');
      row.className = `queue-row${i === 0 ? ' next' : ''}`;
      row.href = pr.html_url;
      row.rel = 'noopener';
      row.innerHTML =
        '<div class="queue-pos"></div><img class="queue-avatar" alt="" width="30" height="30" loading="lazy">' +
        '<div class="queue-who"><div class="queue-author"></div><div class="queue-message"></div></div>' +
        '<div class="queue-eta"><div class="queue-eta-kicker">预计上线</div><div class="queue-eta-time"></div></div>';
      row.querySelector('.queue-pos').textContent = String(i + 1).padStart(2, '0');
      row.querySelector('.queue-avatar').src = `${pr.user.avatar_url}&s=60`;
      row.querySelector('.queue-author').textContent = `@${pr.user.login}`;
      row.querySelector('.queue-message').textContent = pr.title;
      const waitMinutes = boot.mergeIntervalMinutes * i + Math.ceil(nextMergeIn() / 60_000);
      row.querySelector('.queue-eta-time').textContent =
        waitMinutes <= 0 ? '下一次校验通过后' : `约 ${waitMinutes} 分钟后`;
      return row;
    }));
  } catch {
    $('queueCount').textContent = '?';
    list.replaceChildren(Object.assign(document.createElement('p'), {
      className: 'queue-empty',
      textContent: '暂时拿不到队列（GitHub API 限流或网络问题）。稍后再看。',
    }));
  }
}

// ── page chrome ─────────────────────────────────────────────────────────────

function setup() {
  for (const node of document.querySelectorAll('.merge-mins')) {
    node.textContent = String(boot.mergeIntervalMinutes);
  }
  for (const id of ['repoLink', 'repoLinkFooter']) {
    const link = $(id);
    if (link) link.href = `https://github.com/${boot.repo}`;
  }

  const copy = $('copyPrompt');
  if (copy) {
    copy.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText($('promptText').textContent.trim());
        copy.textContent = '已复制';
      } catch {
        copy.textContent = '手动复制吧';
      }
      setTimeout(() => { copy.textContent = '复制'; }, 2000);
    });
  }

  const nav = $('nav');
  if (nav) {
    const onScroll = () => nav.classList.toggle('visible', window.scrollY > window.innerHeight * 0.6);
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }

  const loadMore = $('loadMore');
  if (loadMore) loadMore.addEventListener('click', loadWholeGallery);

  buildTabs();
  applyFilters();

  tickClock();
  tickMergeClock();
  setInterval(() => { tickClock(); tickMergeClock(); }, 1000);

  loadQueue();
  setInterval(loadQueue, 120_000);

  pollCurrent();
  // Matched to the Cache-Control on data/*, so a poll that comes back stale is
  // the exception rather than the rule.
  setInterval(pollCurrent, 15_000);
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', setup);
else setup();
