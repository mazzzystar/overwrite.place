import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WALL_DESKTOP, WALL_MOBILE, layoutWall } from '../scripts/lib/wall.js';

/** A pool of n artworks: no.n is live (life null), the rest ranked lifespans. */
function pool(n) {
  const artworks = [];
  for (let i = 1; i <= n; i++) {
    artworks.push({
      no: i,
      author: `a${i}`,
      message: `m${i}`,
      // Deterministic spread of lifespans, a few ties on purpose.
      life: i === n ? null : (i * 7919) % 100000,
    });
  }
  return artworks;
}

const EPS = 1e-9;

function assertGeometry({ placed, fields, more }) {
  const cells = [...placed, ...fields, ...(more ? [more] : [])];

  for (const c of cells) {
    assert.ok(c.x >= -EPS && c.y >= -EPS && c.x + c.s <= 1 + EPS && c.y + c.s <= 1 + EPS, '格子越界');
  }

  // Squares from a quadtree can only meet edge-to-edge: any overlap at all
  // would mean two artworks fighting for the same wall space.
  for (let i = 0; i < cells.length; i++) {
    for (let j = i + 1; j < cells.length; j++) {
      const a = cells[i], b = cells[j];
      const overlap = Math.min(a.x + a.s, b.x + b.s) - Math.max(a.x, b.x) > EPS
        && Math.min(a.y + a.s, b.y + b.s) - Math.max(a.y, b.y) > EPS;
      assert.ok(!overlap, `格子重叠：${JSON.stringify(a)} 和 ${JSON.stringify(b)}`);
    }
  }

  // Together the cells tile the whole square — no hole ever shows through.
  const area = cells.reduce((sum, c) => sum + c.s * c.s, 0);
  assert.ok(Math.abs(area - 1) < 1e-6, `总面积 ${area}，应为 1`);
}

test('墙是满铺的：不重叠、不越界、面积总和为 1', () => {
  for (const n of [1, 2, 6, 25, 120, 600]) {
    assertGeometry(layoutWall(pool(n), WALL_DESKTOP));
    assertGeometry(layoutWall(pool(n), WALL_MOBILE));
  }
});

test('活着的那幅永远是唯一最大块', () => {
  for (const n of [2, 6, 120, 600]) {
    const { placed } = layoutWall(pool(n), WALL_DESKTOP);
    const live = placed.filter((t) => t.art.life === null);
    assert.equal(live.length, 1);
    assert.equal(live[0].s, 0.5);
    for (const t of placed) if (t !== live[0]) assert.ok(t.s < 0.5, '死作品不得与活作品同大');
  }
});

test('布局是纯函数：同样的输入两端算出同一面墙', () => {
  const a = layoutWall(pool(120), WALL_DESKTOP);
  const b = layoutWall(pool(120), WALL_DESKTOP);
  assert.deepEqual(a, b);
});

test('换一个活着的作品，整面墙重新洗', () => {
  const artworks = pool(30);
  const before = layoutWall(artworks, WALL_DESKTOP);
  // The overwrite: old live dies with a lifespan, a newcomer takes the wall.
  artworks[artworks.length - 1].life = 3600;
  artworks.push({ no: 31, author: 'new', message: 'new', life: null });
  const after = layoutWall(artworks, WALL_DESKTOP);
  const at = (layout, no) => layout.placed.find((t) => t.art.no === no);
  assert.notDeepEqual(
    { x: at(before, 1).x, y: at(before, 1).y },
    { x: at(after, 1).x, y: at(after, 1).y, seedChanged: false },
  );
  assert.equal(at(after, 31).s, 0.5);
  assert.ok(at(after, 30).s <= 0.25, '前任要缩进队伍里');
});

test('手机墙最多 40 块，放不下的从「+N」进馆藏', () => {
  const { placed, more } = layoutWall(pool(600), WALL_MOBILE);
  assert.ok(placed.length <= 40);
  assert.ok(more !== null);
  const shown = placed.length;
  // Everyone is accounted for: on the wall, or behind the door.
  assert.equal(shown + more.count, 600);
  // The door must be reachable — it sits where an evicted tile was.
  assert.ok(more.s >= WALL_MOBILE.minSize - EPS);
});

test('桌面墙装下 600 幅里的绝大多数，其余可数', () => {
  const { placed, more } = layoutWall(pool(600), WALL_DESKTOP);
  assert.ok(placed.length > 200, `桌面墙只放了 ${placed.length} 幅`);
  assert.equal(placed.length + more.count, 600);
});

test('空墙与单幅墙都能挂', () => {
  assertGeometry(layoutWall([], WALL_DESKTOP));
  const { placed, fields } = layoutWall(pool(1), WALL_DESKTOP);
  assert.equal(placed.length, 1);
  assert.ok(fields.length > 0, '其余应是色块');
});
