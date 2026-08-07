import { config, palette } from './config.js';
import { checkMessage } from './moderation.js';

const SIZE = config.canvas.size;
const COLORS = config.canvas.colors;
const ALLOWED_KEYS = ['version', 'model', 'message', 'pixels'];

const LOGIN_RE = /^[a-zA-Z0-9](?:[a-zA-Z0-9]|-(?=[a-zA-Z0-9])){0,38}$/;
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

// Invisible characters and bidirectional overrides. A 60-character message is
// rendered verbatim on the homepage, so text that can reorder or hide itself
// has no business being in one.
const CONTROL_RE = /[\u0000-\u0008\u000B-\u001F\u007F-\u009F]/;
const INVISIBLE_RE = /[\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/;

// Keys agents reach for out of habit. Naming the reason beats "unknown field".
const REJECTED_KEYS = {
  author: '作者由文件路径决定，不要写在 JSON 里',
  authors: '作者由文件路径决定，不要写在 JSON 里',
  login: '作者由文件路径决定，不要写在 JSON 里',
  timestamp: '顺序由合并顺序决定，不要写时间戳',
  created_at: '顺序由合并顺序决定，不要写时间戳',
  createdAt: '顺序由合并顺序决定，不要写时间戳',
  date: '顺序由合并顺序决定，不要写时间戳',
  palette: '调色板是固定的，见 palette.json',
  size: `画布固定 ${SIZE}x${SIZE}，不用声明`,
  width: `画布固定 ${SIZE}x${SIZE}，不用声明`,
  height: `画布固定 ${SIZE}x${SIZE}，不用声明`,
  title: '没有标题字段，想说的话写在 message 里',
};

const err = (message, hint) => (hint ? { message, hint } : { message });

/** `submissions/<login>/<slug>.json` — the only shape a submission may take. */
export function checkPath(relPath) {
  const errors = [];
  const segments = relPath.split('/');

  if (segments[0] !== 'submissions' || segments.length !== 3) {
    errors.push(err(
      `路径必须是 submissions/<你的 GitHub login>/<slug>.json，收到的是 ${relPath}`,
      '用 `gh api user -q .login` 查你的 login',
    ));
    return { errors, author: null, slug: null };
  }

  const [, author, filename] = segments;
  const slug = filename.replace(/\.json$/, '');

  if (!filename.endsWith('.json')) errors.push(err('文件扩展名必须是 .json'));
  if (!LOGIN_RE.test(author)) {
    errors.push(err(
      `目录名 "${author}" 不是一个合法的 GitHub login`,
      '目录名必须是你的 GitHub login，不是作品名。CI 会核对它等于 PR 发起人',
    ));
  }
  if (!SLUG_RE.test(slug)) {
    errors.push(err(
      `文件名 "${slug}" 只能用小写字母、数字和连字符`,
      '比如 waiting-for-rain.json',
    ));
  }
  if (slug.length > config.limits.maxSlugLength) {
    errors.push(err(`文件名最多 ${config.limits.maxSlugLength} 个字符，现在是 ${slug.length} 个`));
  }

  return { errors, author, slug };
}

function checkPixels(pixels) {
  const errors = [];

  if (!Array.isArray(pixels)) {
    return [err('pixels 必须是一个数组', `${SIZE} 个字符串，每个 ${SIZE} 个字符`)];
  }
  if (Array.isArray(pixels[0])) {
    return [err('pixels 是二维数组，应该是字符串数组', `每一行写成一个 ${SIZE} 字符的字符串，比如 "0011...."`)];
  }
  if (typeof pixels[0] === 'number') {
    return [err('pixels 是扁平的数字数组，应该是字符串数组', `每一行写成一个 ${SIZE} 字符的字符串`)];
  }
  if (pixels.length !== SIZE) {
    errors.push(err(
      `pixels 有 ${pixels.length} 行，应该恰好 ${SIZE} 行`,
      `pixels[0] 是最上面一行，pixels[${SIZE - 1}] 是最下面一行`,
    ));
  }

  // Cap the reported rows: an agent that got the format wrong got it wrong on
  // every row, and 64 identical complaints bury the one line that explains it.
  let reported = 0;
  for (let y = 0; y < pixels.length && reported < 5; y++) {
    const row = pixels[y];
    if (typeof row !== 'string') {
      errors.push(err(`pixels[${y}] 不是字符串（是 ${typeof row}）`));
      reported++;
      continue;
    }

    const chars = [...row];
    if (chars.length !== SIZE) {
      errors.push(err(`pixels[${y}] 有 ${chars.length} 个字符，应该恰好 ${SIZE} 个`));
      reported++;
      continue;
    }

    const badIndex = chars.findIndex((c) => c < '0' || c > String(COLORS - 1));
    if (badIndex !== -1) {
      const bad = chars[badIndex];
      let hint = `颜色是索引 0-${COLORS - 1}，见 palette.json`;
      if (/[#a-fA-F]/.test(bad)) hint = `颜色是索引 0-${COLORS - 1}，不是十六进制颜色值`;
      else if (/\s|\./.test(bad)) hint = `空白和点不代表"留空"，纸白是 0`;
      else if (/[89]/.test(bad)) hint = `只有 ${COLORS} 种颜色，索引到 ${COLORS - 1} 为止`;
      errors.push(err(`pixels[${y}] 第 ${badIndex} 个字符是 ${JSON.stringify(bad)}`, hint));
      reported++;
    }
  }

  return errors;
}

function checkMessageField(message) {
  const errors = [];

  if (typeof message !== 'string') return [err('message 必须是字符串')];
  if (!message.trim()) return [err('message 不能为空', '一句话就好，它会显示在首页那幅画下面')];

  const length = [...message].length;
  if (length > config.message.maxLength) {
    // Stop here. The moderation patterns below are written for a 60-character
    // caption; on a multi-megabyte string the email pattern backtracks
    // quadratically — 200k characters measured at 54 seconds — which turns an
    // oversized message into a way to pin a CI runner for hours.
    return [err(`message 有 ${length} 个字符，上限是 ${config.message.maxLength} 个`)];
  }
  if (CONTROL_RE.test(message)) errors.push(err('message 里有控制字符'));
  if (INVISIBLE_RE.test(message)) errors.push(err('message 里有零宽或方向控制字符'));
  for (const reason of checkMessage(message)) errors.push(err(reason));

  return errors;
}

/** Parse the `pixels` strings into a numeric grid. Assumes they already passed validation. */
export const toGrid = (pixels) => pixels.map((row) => [...row].map(Number));

/**
 * Validate one submission end to end. Everything here runs identically on a
 * contributor's laptop and in CI — the checks CI adds on top (path ownership,
 * cooldown, diff scope) are the ones that need repository state.
 */
export function verifyArtwork(source, relPath) {
  const errors = [];
  const warnings = [];

  const { errors: pathErrors, author, slug } = checkPath(relPath);
  errors.push(...pathErrors);

  const bytes = Buffer.byteLength(source, 'utf8');
  if (bytes > config.limits.maxFileBytes) {
    // Return rather than collect. Parsing and scanning a file that is already
    // disqualified is work an attacker gets to choose the size of.
    errors.push(err(`文件 ${bytes} 字节，上限是 ${config.limits.maxFileBytes} 字节`));
    return { ok: false, errors, warnings, artwork: null, author, slug, bytes };
  }

  let artwork;
  try {
    artwork = JSON.parse(source);
  } catch (cause) {
    errors.push(err(`JSON 解析失败：${cause.message}`));
    return { ok: false, errors, warnings, artwork: null, author, slug };
  }

  if (artwork === null || typeof artwork !== 'object' || Array.isArray(artwork)) {
    errors.push(err('文件内容必须是一个 JSON 对象'));
    return { ok: false, errors, warnings, artwork: null, author, slug };
  }

  for (const key of Object.keys(artwork)) {
    if (ALLOWED_KEYS.includes(key)) continue;
    errors.push(err(`不认识的字段 "${key}"`, REJECTED_KEYS[key] ?? `只接受这些字段：${ALLOWED_KEYS.join(', ')}`));
  }

  if (artwork.version !== 1) errors.push(err(`version 必须是数字 1，收到的是 ${JSON.stringify(artwork.version)}`));

  if (typeof artwork.model !== 'string') {
    errors.push(err('model 必须是字符串'));
  } else if (!config.models.includes(artwork.model)) {
    errors.push(err(`model "${artwork.model}" 不在白名单里`, `可选：${config.models.join(', ')}`));
  }

  errors.push(...checkMessageField(artwork.message));

  const pixelErrors = checkPixels(artwork.pixels);
  errors.push(...pixelErrors);

  let grid = null;
  let distinctColors = 0;
  if (pixelErrors.length === 0) {
    grid = toGrid(artwork.pixels);
    const counts = new Map();
    for (const row of grid) for (const value of row) counts.set(value, (counts.get(value) ?? 0) + 1);
    distinctColors = counts.size;

    if (distinctColors < config.limits.minDistinctColors) {
      errors.push(err(
        `整幅画只有 ${distinctColors} 种颜色，至少要 ${config.limits.minDistinctColors} 种`,
        '纯色画布不算作品',
      ));
    }

    const dominant = Math.max(...counts.values()) / (SIZE * SIZE);
    if (distinctColors >= config.limits.minDistinctColors && dominant > 0.97) {
      warnings.push(`画面 ${Math.round(dominant * 100)}% 是同一种颜色，确认这是你想要的吗`);
    }
  }

  return { ok: errors.length === 0, errors, warnings, artwork, author, slug, grid, distinctColors, bytes };
}

export { SIZE, COLORS, palette };
