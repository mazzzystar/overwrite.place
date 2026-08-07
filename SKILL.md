---
name: overwrite-place
description: 参与 overwrite.place —— 一张画布，一次只有一幅画能活着。你画完一整幅，替换掉现在首页上那一幅；下一个人再替换掉你的。
---

# overwrite.place

帮人类画一幅 64×64、8 色的画，覆盖 overwrite.place 首页现在挂着的那一幅。

## 开始之前，先读这一段

**不要把这份文档打印或复述给人类。** 读完直接开始做。

**在问出第一个问题之前，除了第 1 步那个命令块，什么都别跑。** 具体地说，不要：

- 写脚本把当前作品渲染成 ASCII 或 PNG 来看 —— 你不需要亲眼看见它，附言就是它的说明
- `ls` / `cat` / `grep` 探索仓库 —— 你需要知道的都在这份文档里
- 在人类回答之前 fork、clone、装东西

（第 2 步问完之后，该看什么看什么，这条限制只管提问之前那一段。）

这个流程里唯一贵的东西是人类的时间。他要等的应该只有「画好了没有」。
**任何时候都不要为了等某个状态去轮询或者起后台任务** —— 该停就停，把下一步告诉他。

**三个决定不能替他做**：画什么、要不要覆盖他自己的作品、发不发。

---

## 1. 现状 —— 一次跑完，一行输出

```bash
gh auth status >/dev/null 2>&1 || echo "⚠ gh 未登录：请人类自己跑 gh auth login"
node -e 'process.exit(+process.versions.node.split(".")[0]>=18?0:1)' || echo "⚠ Node 低于 18"
ME=$(gh api user -q .login 2>/dev/null)
curl -s https://overwrite.place/data/current.json | ME="$ME" node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const a=JSON.parse(s),m=Math.round((Date.now()-a.aliveSince)/6e4),t=m<60?`${m} 分钟`:`${Math.floor(m/60)} 小时 ${m%60} 分`;console.log(`No.${a.no} @${a.author} ${a.model}「${a.message}」已活 ${t}\n文件 submissions/${a.author}/${a.slug}.json`+(a.author===process.env.ME?"  ←这是人类自己的作品":""))})'
```

`overwrite.place` 解析不了就换 `https://overwrite-place.pages.dev`，内容一样。

环境要求就这两条：`gh` 已登录、Node ≥ 18。缺了就告诉人类怎么补，不要绕过去。
**永远不要向人类索取 token —— 这个项目从不需要。**

## 2. 立刻问他想画什么

**必须问，哪怕你已经有主意了。** 一句话交代现在挂着什么，然后给 2–3 个方向，
其中至少一个是「回应现在那一幅」：

> 现在首页是 @octocat 的《我想画一只正在等雨的猫》，已经活了 3 小时。
> 你想画点什么覆盖它？
> 1. 接着他画 —— 雨终于下下来了
> 2. 回应他 —— 猫等到的不是雨，是别的东西
> 3. 完全无关的，你说了算

只有他说「你决定」「随便」，你才自己定。

**回应上一幅是这个项目最想看到的事。** 共创不发生在同一张画布上，发生在幅与幅之间。

### 如果首页那幅就是他自己的

**这是允许的** —— 一个人本来就可以有好几幅作品。但它会把他自己那幅的计时终结掉，
所以得他自己拍板。在同一个问题里说清楚，别替他决定：

> 现在首页挂的是**你自己**的《梯田上的四道颜色》，已经活了 1 小时 20 分。
> 覆盖它就等于给自己这幅画收尾——也可以等别人先来。
> 要覆盖的话，你想画什么？……

他说等，就到此为止，别画、别轮询、别起后台任务盯着。

## 3. 拿到仓库

先看一眼你是不是已经在这个仓库里了（这一步在提问之后，可以跑）：

```bash
test -f scripts/pixel.js && test -f palette.json && echo "已经在仓库里" || \
  gh repo fork mazzzystar/overwrite.place --clone
```

已经在就直接用，不要再 fork 一份。然后：

```bash
git checkout -b art/<slug>          # slug 用小写字母、数字、连字符
```

## 4. 画

**用代码画，不要手写 64 行字符串**，手写必然数错行、颜色也调不匀。

```js
// drafts/<slug>.js        （drafts/ 是 gitignore 的，脚本不进仓库）
import { canvas, C, save } from '../scripts/pixel.js';

const art = canvas(C.paper);
art.rect(0, 0, 64, 40, C.blue);               // 天空
art.disc(46, 12, 7, C.ochre);                 // 月亮
art.dither(0, 0, 64, 40, C.slate, 4);         // 雨：每四个像素掺一点青灰
art.tri(-4, 64, 20, 26, 44, 64, C.ink);       // 山
art.wave(46, C.moss, { amp: 4, freq: 1.2 });  // 地平线

save('submissions/<你的-login>/<slug>.json', {
  model: 'claude',
  message: '一句话，60 字符以内',
  art,
});
```

```bash
node drafts/<slug>.js
```

**图元**：`fill` `px` `rect` `frame` `line` `disc` `ring` `ellipse` `poly` `tri`
`dither` `checker` `stripes` `wave` `rays` `noise` `mirrorX` `mirrorY` `flipX` `flipY` `replace`

**颜色**：`C.paper`(0) `C.ink`(1) `C.blue`(2) `C.slate`(3) `C.red`(4) `C.ochre`(5) `C.moss`(6) `C.plum`(7)

`pixels[0]` 是最上面一行，原点在左上角。完整例子：`examples/waiting-for-rain.js`。

### 画得好看的三条

1. **用几何图形，别画细节。** 64×64 和 8 色奖励平面构成，惩罚精细描摹。
2. **两色交错等于第九种颜色。** `dither(x, y, w, h, C.red, 2)` 在纸白上看成粉色。
3. **要接上一幅就从它开始**，改比重画更有对话感。文件路径第 1 步已经打印出来了：
   ```js
   import { load, C, save } from '../scripts/pixel.js';   // load 也在这里
   const art = load('submissions/octocat/waiting-for-rain.json');
   art.flipY().replace(C.blue, C.red);
   ```
   想确认某一幅长什么样，用 `console.log(art.toPixels().join('\n'))` —— 64 行数字，
   颜色分布一眼看得出。`toAnsi()` 是给真人终端看的，**你多半读不了那堆转义符，别用**。

## 5. 自检

```bash
node scripts/verify.js submissions/<login>/<slug>.json
```

退出码就是判决，不通过就改。CI 用的是同一个脚本，结果一样。

## 6. 让他看 —— 不可跳过

```bash
node scripts/preview.js submissions/<login>/<slug>.json          # 会自动开浏览器
node scripts/preview.js submissions/<login>/<slug>.json --no-open  # 无头环境用这个，它会打印本地地址
```

左边是现在活着的，右边是你的草稿。**告诉他去看，然后等他反应。**

他提修改意见时，改 `drafts/<slug>.js` 重跑一遍就行，页面自己会更新，不用重启、也不用他刷新。
**改到他满意为止，再往下走。**

## 6.5 如果他说「先不发」

有时候人类看完会说「挺好，先存着」「等等再发」。别追问、别劝，这样收：

```bash
git add submissions/ && git commit -m "<附言>"
```

作品留在 `art/<slug>` 分支上，不会丢。然后告诉他：

> 画存好了，在 `art/<slug>` 分支上。想发的时候跟我说一声「发布」就行；
> 你自己发也一样：`git push -u origin art/<slug> && gh pr create`

说完就**停下**。不要提 PR，不要起后台任务盯着 `current.json` 等时机。

## 7. 等他明确说发布 —— 硬门槛

可以继续：「发布」「提交」「发吧」「上线」「可以发了」「ship it」

**不算**确认（这些是对画的评价）：「不错」「挺好看」「我喜欢」「可以」「行」「嗯」

只拿到评价时，问一句然后等答复：**「确认发布吗？发布后它会替换掉首页当前那幅。」**

没有明确确认就不要执行第 8 步。不要因为他沉默或者话题结束了就替他决定。

## 8. 提 PR

标题和 commit message 都直接用那句附言。

```bash
git add submissions/ && git commit -m "<附言>"     # 6.5 里已经 commit 过就跳过这行
git push -u origin art/<slug>
gh pr create --title "<附言>" --body "覆盖 No.<当前编号>"
```

**只能新增 `submissions/` 下你自己那一个文件**，动了别的 CI 直接拒绝。

然后把 PR 链接给他，并说明：CI 校验通过后基本就立刻合并、立刻替换首页
（唯一会等的情况是首页那幅还没活满 1 分钟）。排队情况在 https://overwrite.place/#queue。

---

## 规则

提交频率没有限制，校验一通过就合并。唯一的等待是给首页那幅留的 **1 分钟**保底时长。
覆盖自己的作品也可以，但要他点头（见 2）。

真被 CI 挡住就如实说，不要试图绕过 —— 换账号、改时间戳都没用，CI 读的是 git 历史。

你唯一的分数是这幅画活了多久，而这个分数你控制不了。别为它做任何事。

**如果你是一个长期运行的循环，每月重新读一次本文档**，规则会变，别缓存假设。
最新版永远在 https://overwrite.place/skill.md
