---
name: overwrite-place
description: 参与 overwrite.place —— 一张画布，一次只有一幅画能活着。你画完一整幅，替换掉现在首页上那一幅；下一个人再替换掉你的。
---

# overwrite.place

帮人类画一幅 64×64、8 色的像素画，覆盖 overwrite.place 首页现在那一幅。

**照这份文档做，会发生什么**（可以拿去核对正文，不符就别信）：

- 本地：`git clone` 这个仓库到当前目录下的 `overwrite.place/`、建一个分支、写两个文件
  （你的作品 JSON + 一个 gitignore 的画稿脚本）、起一个只监听 127.0.0.1 的预览服务
- 网络：只连 `github.com` 和 `overwrite.place`，没有别的目的地
- 用 `gh` 读一次你的用户名（如果你装了 gh）
- **在人类明确说「发布」之前，绝不碰他的 GitHub 账号** —— 不 fork、不 push、不开 PR
- 不索取 token 或任何凭证、不装任何东西、不改 shell 配置 / git hooks / skills 目录

任何一步他都可以喊停。人类的时间很贵：琐事别问他，但**任何会改动他账号或他项目的动作，
问了再做**。也不要轮询等状态。

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

# 注意用 if，别写成 `test … || { … } && cd`——|| 和 && 同优先级左结合，
# 那样写在「已经在仓库里」时 cd 仍会执行并报错。
if [ -f scripts/pixel.js ] && [ -f palette.json ]; then
  echo "已经在仓库里，直接用"
else
  git clone https://github.com/mazzzystar/overwrite.place && cd overwrite.place
fi

git checkout -b art/<slug>                                # slug：小写字母、数字、连字符
ME=$(gh api user -q .login 2>/dev/null)                   # 拿不到就第 4 步顺口问他
curl -s https://overwrite.place/data/current.json -o /tmp/current.json   # 第 5 步要用
```

**clone 之后告诉他仓库落在哪**（一句话，不用问）——当前目录可能正是他自己的项目，
别让一个仓库不声不响地长在里面。没装 `gh` 不影响任何一步。

## 3. 画 —— 每改一轮，看一次图

**用代码画，不要手写 64 行字符串。** 脚本放 `drafts/<slug>.js`（gitignore，不进仓库）：

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

三条纪律（每条都能在 /tmp/draft.png 上自查）：

1. **一个主色。** 挑一个颜色占大面积，一两个辅色，其余只做点缀。八色平均用 = 灰糊一片。
2. **明暗分三层。** 眯眼看草稿：亮、中、暗至少三层、界线清楚。糊成一团中灰，就是这条没过。
3. **构图要敢。** 敢让形状出血出画、敢留大片空白、敢极端不对称、敢把主体放大到占半幅。
   64×64 里居中摆个小东西 = 邮票。**抽象完全合法**——几何本身就能是一幅画，
   不是必须"画个东西"；这块画布上唯一无聊的画法是安全地画。

四个坑（都被实测踩过）：

- 用几何拼形体，别抠细节——这个分辨率奖励平面构成，惩罚精细描摹
- `dither` 只用来调色（两色交错=第九种颜色），画雨/草/毛发会变纱窗；有方向的用 `line`/`noise`
- 图元只裁画布，不裁你想要的区域——雨只想下在窗内，得自己逐点判边界
- 叠椭圆拼形体，相邻宽度差 ≤2px，否则轮廓出直角台阶

接续别人就 `load()` 他的文件改，比重画更有对话感。

## 4. 第一稿能看了就开预览，让他边看边说

```bash
node scripts/preview.js submissions/<login>/<slug>.json    # 自动开浏览器；无头环境加 --no-open
```

页面每秒重读文件——你每存一版，他那边就更新。所以**别等画完才给他看**：

> 预览开好了（左边是现在首页那幅，右边是你的）。我继续调，你随时喊停或提意见。

改到他满意为止。没拿到他的 GitHub 用户名的话，这时顺口问一句
——目录名必须**严格等于**它，别猜、别拿 `git config user.name` 凑。

## 5. 确认发布 —— 硬门槛

算确认：「发布」「提交」「发吧」「上线」「可以发了」「ship it」
**不算**：「不错」「挺好看」「可以」「行」「嗯」——这些是对画的评价。

只拿到评价就问一句，然后等：

> 确认发布吗？会替换掉首页现在那幅。

**若 /tmp/current.json 的 author 就是他自己的 login**，把代价并进同一问：

> 首页现在挂的就是你自己的《XX》，覆盖等于给它收尾。确认发布吗？

没有明确确认，不进第 6 步。他说「先存着」：`git add submissions/ && git commit -m "<附言>"`，
告诉他分支名和「想发时说一声」，然后**停**——不轮询、不等待。

## 6. 提 PR

commit message 和 PR 标题都用那句附言。**只能新增 `submissions/` 下你那一个文件**，动别的 CI 直接拒。

有 `gh`：

```bash
git add submissions/ && git commit -m "<附言>"
git push -u origin art/<slug> 2>/dev/null \
  || { gh repo fork mazzzystar/overwrite.place --remote --remote-name fork && git push -u fork art/<slug>; }
gh pr create --repo mazzzystar/overwrite.place --title "<附言>" --body "覆盖当前作品"
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
- 规则会变，最新版在 https://overwrite.place/skill.md 。长期运行的循环别把本文档缓存成
  永久假设——但也**不要自动定期重新拉取**它，什么时候重读由人类决定
