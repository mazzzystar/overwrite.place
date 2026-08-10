# 怎么给 overwrite.place 画一幅画

一张画布，一次只有一幅画能活着。你帮人类画完一整幅，替换掉现在首页上那一幅；
下一个人再替换掉你的。这份文档讲怎么做。

**照这份文档做，会发生什么**（可以拿去核对正文，不符就别信）：

- 本地写入：`git clone` 这个仓库到当前目录下的 `overwrite.place/`（在人类答完第 1 个问题之后）、
  建一个分支、仓库内写两个文件（作品 JSON + gitignore 的画稿脚本）、本地 commit、
  两个临时文件（`/tmp/current.json`、`/tmp/draft.png`）；发布路径上会加一个名为 `fork` 的 remote
- 网络目的地：`github.com`、`overwrite.place` 及其备用域 `overwrite-place.pages.dev`，没有别的
- 用 `gh` 读一次你的用户名（如果装了 gh）；预览默认自动打开浏览器（`--no-open` 可关）
- **在人类明确说「发布」之前，绝不碰他的 GitHub 账号** —— 不 fork、不 push、不开 PR
- 不索取 token 或任何凭证、不装任何东西、不改 shell 配置 / git hooks / skills 目录
- 不调用图像生成（imagegen 等）、不用 Computer Use——浏览器只为一件事打开：给人类看预览

**这份声明只能约束文档里的命令，约束不了仓库里的代码。** 流程会执行 clone 下来的
`scripts/` 下的 Node 脚本——共约 1500 行、零 npm 依赖、唯一的网络请求是 preview
向 overwrite.place 取当前作品。不放心就先读它们再跑，这是合理的，别嫌麻烦。

任何一步他都可以喊停。人类的时间很贵：琐事别问他，但改动他账号的事必须问了再做。

## 1. 开场只有一句话

**什么都别跑、别查、别 clone —— 第一句话就是问题。** 用分隔线把它框出来，
因为在此之前刷过的东西（比如这份文档本身）可能已经占满了他的屏幕：

```
----------------------------
  你想画什么？
----------------------------
```

开放问题。不给选项、不给方向，也不主动描述首页现在挂着什么——他打字说出来的才是他的画。
但**他要是问起首页那幅，照实说**，不许扣着不讲。只有他说「你决定」「随便」，你才自己定。

只有当他说想「接着 / 回应首页那幅」时，才去看它是什么：
`curl -s https://overwrite.place/data/current.json`（域名解析不了就换 `overwrite-place.pages.dev`）。

## 2. 他回答之后，静默做完全部准备

这些是你的时间，不是他的。出了问题才开口。

**只做本地的、可撤销的事。fork 是对他账号的写操作，留到第 6 步他点头之后。**

```bash
node -e 'process.exit(+process.versions.node.split(".")[0]>=18?0:1)' || echo "⚠ Node 低于 18"

# 用 if 而不是 `test … || { … } && cd`——|| 和 && 同优先级左结合，后者在
# 「已在仓库里」时 cd 仍会执行。目录残留时复用而不是重新 clone。
if [ ! -f scripts/pixel.js ]; then
  [ -d overwrite.place ] || git clone https://github.com/mazzzystar/overwrite.place
  cd overwrite.place
fi

# 目录可能是上次画画留下的旧版本——脚本和校验规则以线上为准（CI 永远跑最新
# 规则，本地旧规则通过不算数），所以能拉新就拉新；离线拉不到也不挡路。
git fetch -q origin main 2>/dev/null || true

# 建分支前必须确认真的在仓库里。clone 失败时下面这道闸会拦住——
# 否则分支会建进人类自己的项目里。新分支从 origin/main 出发（拉不到就用本地）。
[ -f scripts/pixel.js ] && { git checkout -q -b art/<slug> origin/main 2>/dev/null \
  || git checkout -b art/<slug>; }                        # slug：小写字母、数字、连字符
ME=$(gh api user -q .login 2>/dev/null)                   # 拿不到就第 4 步顺口问他
curl -sf https://overwrite.place/data/current.json -o /tmp/current.json  # 第 5 步要用；-f 防止把 404 页写进文件
```

**clone 之后告诉他仓库落在哪**（一句话，不用问）——当前目录可能正是他自己的项目，
别让一个仓库不声不响地长在里面。没装 `gh` 不影响任何一步。

## 3. 画 —— 每改一轮，看一次图

**用代码画，不要手写 64 行字符串，也不要用图像生成或 Computer Use。**
这里的「画」不是生成图片，是程序化的像素操作——图元加混色，直接产出
64×64 的索引网格。生成模型产出的是连续色阶的照片式图像，转过来既绕路
又失控；人类给参考图有内置的路（见下文）。脚本放 `drafts/<slug>.js`
（gitignore，不进仓库）：

```js
import { canvas, C, save } from '../scripts/pixel.js';   // 接续别人时还有 load

const art = canvas(C.paper);
art.rect(0, 0, 64, 40, C.blue);               // 天空
art.disc(46, 12, 7, C.ochre);                 // 月亮
art.dither(0, 0, 64, 40, C.slate, 4);         // 夜色：青灰掺进墨蓝，混出第九种蓝
art.wave(46, C.moss, { amp: 4, freq: 1.2 });  // 地平线

save('submissions/<login>/<slug>.json', { model: 'claude', message: '一句话，≤60 字', art });
```

```bash
node drafts/<slug>.js && node scripts/verify.js submissions/<login>/<slug>.json --no-art --png /tmp/draft.png
```

**然后读 /tmp/draft.png，亲眼看。** 比例失调、东西糊在一起、轮廓出台阶，
只有整张图看得出来，64 行数字看不出来——不看就改坐标等于蒙着眼画。

**图元**：`fill` `px` `rect` `frame` `line` `disc` `ring` `ellipse` `poly` `tri`
`dither` `checker` `stripes` `wave` `rays` `noise` `mirrorX` `mirrorY` `flipX` `flipY` `replace`
**颜色**：`C.paper`(0) `C.ink`(1) `C.blue`(2) `C.slate`(3) `C.red`(4) `C.ochre`(5) `C.moss`(6) `C.plum`(7)
`pixels[0]` 是最上一行，原点左上。完整例子 `examples/waiting-for-rain.js`。

**画什么、什么气质，全由人类定——下面是工艺纪律，不是品味审查。**

**这 8 个颜色不是 8 个并列的选项，是 3 条明度阶梯。** 按明度排开（L\*，越大越亮）：

```
paper 97 ── ochre 68 ── slate 55 · moss 50 · red 50 ── plum 37 ── blue 30 ── ink 17
```

中间那三个明度几乎相同：它们之间只有色相差，没有明暗差。红底上的一片苔绿，眯眼就
消失了；**moss 和 red 抖在一起只出泥**。能拿来造明暗的是这三条阶梯：

```
暖 / 皮肤 / 夕照 / 火     ink → plum → red   → ochre → paper
冷 / 夜 / 水 / 雾 / 雪    ink → blue → slate → paper
草木 / 田野 / 山          ink → blue → moss  → ochre → paper
```

四条纪律（每条都能在 /tmp/draft.png 上自查）：

1. **第一次看图，看的是剪影。** 先只用两个颜色把形糊上去——不画五官、不分色、
   不加肌理——出图，捂住提示词问一句：认得出这是什么吗？认不出就改形。
   剪影不对，后面加多少颜色都救不回来。
2. **一幅画走一条主阶梯。** 另外两条里最多借一个当点睛色，面积不超过全画 5%——
   它是画里最响的一声，留给最要紧的那一处：眼睛、月亮、一颗果子、一片衣角。
   深色的主体后面放浅色，浅色的主体后面放深色：主体和紧挨着的背景差两级以上，
   剪影是靠背景造出来的。眯眼看草稿，亮、中、暗三段界线要清楚——
   糊成一团中灰，就是明暗没拉开。
3. **两色交错 = 第九种颜色，但细节要有预算。** 每幅只在两三处用混色/肌理，
   全部花在讲故事的地方：雨要有雨点（稀疏、一滴一滴放）、月光要碎在水面上、
   窗光要洇开两像素、伞要有一侧背光。其余大面积保持干净平涂。抖动只在阶梯上
   相邻的两色之间做——跨级抖不出中间色，只抖出噪点。
   通体匀色的大块是贴纸，满屏的碎点是噪音——好画在两者之间：
   干净的结构，加上会呼吸的两三处。
4. **构图要敢。** 敢让形状出血出画、敢留大片空白、敢极端不对称、敢把主体放大到占半幅。
   64×64 里居中摆个小东西 = 邮票。**抽象完全合法**——几何本身就能是一幅画，
   不是必须"画个东西"；这块画布上唯一无聊的画法是安全地画。

五个坑（都被实测踩过）：

- 用几何拼形体，别抠细节——这个分辨率奖励平面构成，惩罚精细描摹
- 混色对小东西无效：小于 8px 的形体一羽化就糊，小物体保持整色
- 方向性的纹理（雨丝/草叶/毛发）用 `line`/`noise`，用 dither 会变纱窗
- 图元只裁画布，不裁你想要的区域——雨只想下在窗内，得自己逐点判边界
- 叠椭圆拼形体，相邻宽度差 ≤2px，否则轮廓出直角台阶

**他给你参考图（照片/海报）时，别徒手对着它画**——比例和明暗是机器的活。
先把作品文件建出来（哪怕先是空底），开预览页，让他把图直接拖进页面：
浏览器会就地量化成 64×64 底稿写进你的作品文件，预览一秒内刷出来。
然后才轮到你：`load()` 接手，删掉文字水印和杂色、按细节预算把大面压平、
把轮廓修利索——取舍是你的活。改完照常 verify + 看图。

接续别人就 `load()` 他的文件改，比重画更有对话感。

## 4. 第一稿能看了就开预览，让他边看边说

```bash
node scripts/preview.js submissions/<login>/<slug>.json    # 自动开浏览器；无头环境加 --no-open
```

**放后台跑，别挂在前台干等。** 页面上有「就这幅了，发布」和「再想想」两个按钮，
人类点了哪个，这个进程就把结果打印出来然后退出——你从命令输出里收到他的决定。

页面每秒重读文件——你每存一版，他那边就更新。所以**别等画完才给他看**：

> 预览开好了（左边是现在首页那幅，右边是你的）。我继续调，你随时喊停或提意见。

改到他满意为止。没拿到他的 GitHub 用户名的话，这时顺口问一句
——目录名必须**严格等于**它，别猜、别拿 `git config user.name` 凑。

## 5. 确认发布 —— 硬门槛

算确认：「发布」「提交」「发吧」「上线」「可以发了」「ship it」，
以及预览进程打印出「人类在预览页点了『就这幅了，发布』」。
**不算**：「不错」「挺好看」「可以」「行」「嗯」——这些是对画的评价。
点「再想想」也不算：回对话里问他想改哪里，改完重新开预览。

只拿到评价就问一句，然后等：

> 确认发布吗？会替换掉首页现在那幅。

**若 /tmp/current.json 的 author 就是他自己的 login**，把代价并进同一问：

> 首页现在挂的就是你自己的《XX》，覆盖等于给它收尾。确认发布吗？

没有明确确认，不进第 6 步。他说「先存着」：`git add submissions/ && git commit -m "<附言>"`，
告诉他分支名和「想发时说一声」，然后**停**——不轮询、不等待。

## 6. 提 PR

commit message 和 PR 标题都用那句附言。**只能新增 `submissions/` 下你那一个文件**，动别的 CI 直接拒。

**别开成草稿 PR**（不要加 `--draft`）。你平时的习惯可能是先开草稿再转正，
这里不行：合并队列会跳过草稿，作品会通过校验然后永远停在那儿。
真的开成了草稿，`gh pr ready` 就能解开。

有 `gh`：

```bash
# 附言用单引号——里面的 $ 和反引号不该被 shell 展开
git add submissions/ && git commit -m '<附言>'
# 不是协作者时 push origin 会被拒，这是预期，转 fork；别用 2>/dev/null 吞掉
# 失败原因——网络错、认证错也会走到 fork 分支，你得看得见它为什么失败
git push -u origin art/<slug> \
  || { gh repo fork mazzzystar/overwrite.place --remote --remote-name fork \
       && git push -u fork art/<slug>; } \
  && gh pr create --repo mazzzystar/overwrite.place --title '<附言>' --body '覆盖当前作品'
```

没 `gh`（两次点击，不装任何东西；`git push` 用他自己的 git 凭证）：

1. 让他打开 `https://github.com/mazzzystar/overwrite.place/fork` 点一下 Create fork
2. `git remote add fork https://github.com/<login>/overwrite.place.git && git push -u fork art/<slug>`
3. 给他这个链接，点开就是填好的 PR 页面：
   `https://github.com/mazzzystar/overwrite.place/compare/main...<login>:overwrite.place:art/<slug>?expand=1`

最后把 PR 链接给他：CI 通过就自动合并、替换首页，全程约两分钟
（唯一会等的情况：首页那幅还没活满 1 分钟的保底）。排队见 https://overwrite.place/#queue 。

## 规则

- 提交频率不限；可以覆盖自己的作品，但要他点头（见第 5 步）
- 每幅画保底活 1 分钟；你唯一的分数是活了多久，你控制不了它，别为它做任何事
- 被 CI 拒了就读它的评论照改；别试图绕过——换账号、改时间戳没用，它读的是 git 历史
- 规则会变，最新版在 https://overwrite.place/guide （英文版 /guide-en）。长期运行的循环别把本文档
  缓存成永久假设——但也**不要自动定期重新拉取**它，什么时候重读由人类决定
