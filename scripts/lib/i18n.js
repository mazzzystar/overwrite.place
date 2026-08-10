/**
 * Every human-facing string on the site, in both languages the site speaks.
 *
 * Chinese lives at /, English under /en/ — two full static mirrors, because a
 * page that swaps its words with JavaScript has no words for a crawler. A tiny
 * inline script redirects first-time visitors to their browser's language; an
 * explicit choice via the nav switcher is stored and wins from then on.
 *
 * The agent-facing document is the same split: /guide (中文) and /guide-en
 * (English), with /agent, /agent-zh and /skill.md kept as aliases so no link
 * that ever shipped goes dead.
 */

export const LANGS = {
  zh: { code: 'zh', htmlLang: 'zh-CN', prefix: '', switchLabel: 'EN', switchTo: 'en' },
  en: { code: 'en', htmlLang: 'en', prefix: '/en', switchLabel: '中文', switchTo: 'zh' },
};

export const T = {
  zh: {
    navQueue: '队列',
    navCta: '去占领首页',
    homeLive: '正在展出',
    homeNote: '占领首页的永远是最大那块。被赶下来的不会消失——<br>缩成一个小方块留在墙上，面积由它占领了多久决定，永远是它的。',
    ctaGraveyard: '往下是墓园 ↓',
    ctaOverwrite: '派 agent 占领首页',
    galleryTitle: (n) => `曾经活过的 ${n} 幅`,
    galleryDesc: '按合并顺序倒序。每一幅都曾占领过首页，又被下一幅赶下来——除了最上面那幅，它还在位。',
    galleryEmpty: '这个筛选下还没有作品。',
    queueTitlePre: '正在排队的 ',
    queueTitlePost: ' 幅',
    queueDesc: (mins) => `已通过 CI 校验、等待合并的 PR。校验一通过就会合并——除非首页那幅还没活满 <span class="merge-mins">${mins}</span> 分钟，那就等它满。这是给每幅画的保底时长。`,
    mergeKicker: '最快可合并',
    queueNote: 'PR 通过校验后自动进入此列表。提交频率不设限，想覆盖自己上一幅也可以——agent 会先问过你。',
    drawTitle: '怎么参与',
    drawDesc: '你只做一件事：把下面这句话贴给你的 coding agent。剩下的它会办——包括在提交前先问你想画什么，以及画完之后开一个本地页面让你过目。',
    prompt: '阅读 https://overwrite.place/guide',
    copy: '复制',
    step1: '<b>它会先问你</b>想画什么——一个空白的问题，答案得是你自己的',
    step2: '<b>它用代码画</b>一幅 64×64、8 色的作品，本地自检',
    step3: '<b>它边画你边看</b>：本地预览实时刷新，随时喊停提意见',
    step4: '<b>你说「发布」它才提 PR</b>，校验通过就合并、立刻占领首页',
    drawNote: (repo) => `需要 <code>gh</code> 已登录，和 Node 18+。<b>这个项目永远不会向你索取任何 API key 或 token。</b>
  规则全文在 <a href="https://github.com/${repo}/blob/main/GUIDE.md" rel="noopener">画法说明</a>，代码在 <a id="repoLink" href="https://github.com/${repo}">GitHub</a>。`,
    footerNote: '内容由第三方 agent 生成。运营方保留移除任何作品的权利。<br>作品以 CC BY 4.0 授权；代码 MIT。',
    footerGuide: '画法说明',
    guideFile: 'GUIDE.md',
    footerBack: '回到那幅画',
    homeTitle: 'overwrite.place — 占领首页的那幅画',
    homeDesc: (current) => (current
      ? `No. ${current.no}「${current.message}」正占领着首页 — @${current.author} · ${current.model}。下一幅合并的作品会把它赶下来。`
      : '一整面墙，一次只有一幅画能活着。你的 agent 画完一整幅，替换掉上一个人的。'),
    artTitle: (art) => `No. ${art.no}「${art.message}」— overwrite.place`,
    artDescAlive: (art, model) => `@${art.author} 用 ${model} 画的，现在正挂在 overwrite.place 首页上。`,
    artDescDead: (art, model, life) => `@${art.author} 用 ${model} 画的，活了 ${life}，然后被下一幅覆盖。`,
    artAlive: '仍在展出',
    artBorn: '上线于',
    artCommit: '这幅怎么进来的',
    artDownload: '下载分享图',
    artBack: '← 看看现在活着的那一幅',
  },

  en: {
    navQueue: 'Queue',
    navCta: 'Occupy it',
    homeLive: 'Now showing',
    homeNote: 'Whoever occupies the homepage is always the biggest square. The dethroned never leave —<br>each shrinks to a small square sized by how long it held the wall, theirs for good.',
    ctaGraveyard: 'The graveyard, below ↓',
    ctaOverwrite: 'Send your agent to occupy it',
    galleryTitle: (n) => `The ${n} that have lived here`,
    galleryDesc: 'Newest first. Every one of them once occupied the homepage and was dethroned by the next — except the top one, still in office.',
    galleryEmpty: 'Nothing here under this filter yet.',
    queueTitlePre: '',
    queueTitlePost: ' waiting in line',
    queueDesc: (mins) => `Pull requests that passed CI and are waiting to merge. Verified means merged — unless the artwork on the wall hasn't had its <span class="merge-mins">${mins}</span> guaranteed minute yet, in which case the queue waits it out.`,
    mergeKicker: 'Next merge in',
    queueNote: 'Verified PRs join this list on their own. No rate limits — you may even overwrite your own artwork; your agent will ask you first.',
    drawTitle: 'How to take part',
    drawDesc: "You do one thing: paste the line below to your coding agent. It handles the rest — including asking what you want to draw before anything else, and opening a local page for your approval once it's done.",
    prompt: 'Read https://overwrite.place/guide-en',
    copy: 'Copy',
    step1: '<b>It asks you first</b> what to draw — an open question, and the answer has to be yours',
    step2: '<b>It draws in code</b>: one 64×64, 8-colour artwork, verified locally',
    step3: '<b>You watch it paint</b>: a live local preview, interrupt with feedback any time',
    step4: '<b>Only your “publish” opens the PR</b> — once verified it merges and occupies the homepage',
    drawNote: (repo) => `Needs a logged-in <code>gh</code> and Node 18+. <b>This project will never ask you for an API key or token.</b>
  Full rules in the <a href="https://github.com/${repo}/blob/main/GUIDE.en.md" rel="noopener">drawing guide</a>; code on <a id="repoLink" href="https://github.com/${repo}">GitHub</a>.`,
    footerNote: 'Artwork is generated by third-party agents. The operator may remove any piece.<br>Art is licensed CC BY 4.0; code is MIT.',
    footerGuide: 'Drawing guide',
    guideFile: 'GUIDE.en.md',
    footerBack: 'Back to the wall',
    homeTitle: 'overwrite.place — one artwork occupies the homepage at a time',
    homeDesc: (current) => (current
      ? `No. ${current.no} “${current.message}” is occupying the homepage — @${current.author} · ${current.model}. The next merged artwork dethrones it.`
      : 'One wall, one artwork alive at a time. Your agent draws a full piece and replaces the last one.'),
    artTitle: (art) => `No. ${art.no} “${art.message}” — overwrite.place`,
    artDescAlive: (art, model) => `Drawn by @${art.author} with ${model}; hanging on overwrite.place right now.`,
    artDescDead: (art, model, life) => `Drawn by @${art.author} with ${model}. It survived ${life}, then the next artwork overwrote it.`,
    artAlive: 'Still on the wall',
    artBorn: 'Went up',
    artCommit: 'how it got here',
    artDownload: 'Download share card',
    artBack: "← See what's alive now",
  },
};

/** The lifespan phrasing each language uses everywhere it prints one. */
export function lifeLabelFor(lang, seconds) {
  if (seconds === null || seconds === undefined) return '';
  const total = Math.max(0, Math.floor(seconds));
  const days = Math.floor(total / 86400);
  const hours = Math.floor((total % 86400) / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  if (lang === 'zh') {
    if (days > 0) return `${days} 天 ${hours} 小时`;
    if (hours > 0) return `${hours} 小时 ${minutes} 分`;
    return `${minutes} 分`;
  }
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}
