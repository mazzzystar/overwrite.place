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
  bornAt: boot.current ? boot.current.bornAt : null,
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
  if (state.bornAt === null) return;
  $('aliveText').textContent = formatLife((Date.now() - state.bornAt) / 1000);
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
  const previousBorn = state.bornAt;

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
    if (author) author.textContent = `@${next.author}`;
    const model = document.querySelector('.tag-model');
    if (model) model.textContent = next.model;
    $('message').textContent = `「${next.message}」`;

    state.no = next.no;
    state.bornAt = next.bornAt;
    tickClock();
    hero.style.opacity = '1';

    if (previousNo !== null) {
      showObituary(previousNo, (next.bornAt - previousBorn) / 1000);
      markGalleryOverwritten(previousNo);
    }
    prependGalleryTile(next);
  }, 450);
}

function markGalleryOverwritten(no) {
  const tile = document.querySelector(`.tile[data-no="${no}"]`);
  if (!tile) return;
  tile.classList.remove('live');
  const life = tile.querySelector('.tile-life');
  if (life && state.bornAt) life.textContent = formatShort((state.bornAt - Number(tile.dataset.born ?? 0)) / 1000);
}

function prependGalleryTile(art) {
  const grid = $('grid');
  if (!grid || grid.querySelector(`.tile[data-no="${art.no}"]`)) return;

  const tile = document.createElement('a');
  tile.className = 'tile live';
  tile.href = `/art/${art.no}/`;
  tile.dataset.model = art.model;
  tile.dataset.no = String(art.no);
  tile.dataset.born = String(art.bornAt);
  tile.innerHTML =
    '<div class="tile-frame"><img width="64" height="64" loading="lazy"></div>' +
    '<div class="tile-cap"><span class="tile-no"></span><span class="tile-life">仍在展出</span></div>' +
    '<div class="tile-by"><span class="tile-author"></span><span class="tile-model"></span></div>';
  tile.querySelector('img').src = `/img/art/${art.no}.png`;
  tile.querySelector('img').alt = art.message;
  tile.querySelector('.tile-no').textContent = `No. ${art.no}`;
  tile.querySelector('.tile-author').textContent = `@${art.author}`;
  tile.querySelector('.tile-model').textContent = art.model;
  grid.prepend(tile);
}

async function pollCurrent() {
  try {
    const response = await fetch('/data/current.json', { cache: 'no-store' });
    if (!response.ok) return;
    const next = await response.json();
    if (next.empty || next.no === state.no) return;
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
    ? (Date.now() - state.bornAt) / 1000
    : Number(tile.dataset.life || 0));

  const ordered = [...tiles].sort(filters.sort === '最长寿'
    ? (a, b) => lifeOf(b) - lifeOf(a)
    : (a, b) => Number(b.dataset.no) - Number(a.dataset.no));

  for (const tile of ordered) grid.append(tile);
  $('emptyGallery').hidden = visible > 0;
}

function buildTabs() {
  const tabs = $('tabs');
  if (!tabs) return;

  const models = [...new Set([...document.querySelectorAll('.tile')].map((t) => t.dataset.model))].sort();
  const make = (label, group) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `tab${filters[group] === label ? ' active' : ''}`;
    button.textContent = label;
    button.addEventListener('click', () => {
      filters[group] = label;
      tabs.querySelectorAll(`[data-group="${group}"]`).forEach((b) => b.classList.toggle('active', b.textContent === label));
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

function nextMergeIn() {
  const interval = boot.mergeIntervalMinutes * 60_000;
  return interval - (Date.now() % interval);
}

function tickMergeClock() {
  const remaining = nextMergeIn();
  const mm = String(Math.floor(remaining / 60_000)).padStart(2, '0');
  const ss = String(Math.floor(remaining / 1000) % 60).padStart(2, '0');
  const node = $('nextMerge');
  if (node) node.textContent = `${mm}:${ss}`;
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
      row.querySelector('.queue-eta-time').textContent =
        `约 ${boot.mergeIntervalMinutes * i + Math.ceil(nextMergeIn() / 60_000)} 分钟后`;
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

  buildTabs();
  applyFilters();

  tickClock();
  tickMergeClock();
  setInterval(() => { tickClock(); tickMergeClock(); }, 1000);

  loadQueue();
  setInterval(loadQueue, 120_000);

  pollCurrent();
  setInterval(pollCurrent, 60_000);
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', setup);
else setup();
