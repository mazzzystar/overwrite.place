# How to draw one artwork for overwrite.place

One wall, one artwork alive at a time. You help a human draw a complete piece
that replaces whatever is on the homepage now; the next person replaces yours.
This document explains how.

**What following this document will do** (check it against the body below — if
they disagree, trust neither):

- Local writes: `git clone` this repository into `overwrite.place/` under the
  current directory (after the human answers question 1), one branch, two files
  inside the repo (the artwork JSON + a gitignored drawing script), local
  commits, two temp files (`/tmp/current.json`, `/tmp/draft.png`); on the
  publish path, one remote named `fork` is added
- Network destinations: `github.com`, `overwrite.place` and its fallback domain
  `overwrite-place.pages.dev` — nothing else
- Reads your username once via `gh` (if installed); the preview auto-opens a
  browser by default (`--no-open` turns that off)
- **Until the human explicitly says "publish", never touch their GitHub
  account** — no fork, no push, no PR
- Never asks for tokens or credentials, installs nothing, changes no shell
  config / git hooks / skills directories
- Never calls image generation (imagegen and kin) or computer-use tooling —
  a browser opens for exactly one reason: showing the human the preview

**This declaration can only bind the commands in this document, not the code in
the repository.** The flow runs Node scripts under the cloned `scripts/` —
about 1,500 lines total, zero npm dependencies, whose only network request is
the preview fetching the current artwork from overwrite.place. If that's not
good enough, read them before running them. That is reasonable; don't grumble.

The human can stop any step. Their time is expensive: don't ask about chores,
but anything that writes to their account must be asked first.

## 1. Open with one sentence only

**Run nothing, look nothing up, clone nothing — the first thing out of you is
the question.** Frame it with rules, because whatever scrolled past before this
(this document, for instance) may already fill their screen:

```
----------------------------
  What do you want to draw?
----------------------------
```

An open question. No options, no directions, and don't volunteer what's on the
homepage — what they type out is what makes the artwork theirs. But **if they
ask what's up there now, tell them straight**; no withholding. Only when they
say "you decide" / "anything" do you choose.

Only if they want to "continue / respond to the current one" do you look at it:
`curl -s https://overwrite.place/data/current.json` (if the domain doesn't
resolve, use `overwrite-place.pages.dev`).

## 2. After they answer, do all the prep silently

This is your time, not theirs. Speak up only if something breaks.

**Local, reversible actions only. A fork is a write to their account — it waits
for their nod at step 6.**

```bash
node -e 'process.exit(+process.versions.node.split(".")[0]>=18?0:1)' || echo "⚠ Node below 18"

# `if`, not `test … || { … } && cd` — || and && share precedence and associate
# left, so the cd would still run when we are already inside the repo. If a
# leftover directory exists, reuse it instead of recloning.
if [ ! -f scripts/pixel.js ]; then
  [ -d overwrite.place ] || git clone https://github.com/mazzzystar/overwrite.place
  cd overwrite.place
fi

# The directory may be left over from a previous drawing — scripts and rules
# follow the live site (CI always runs the newest rules; passing old local
# rules counts for nothing), so refresh when possible; offline is fine too.
git fetch -q origin main 2>/dev/null || true

# Confirm we are truly inside the repo before branching. If the clone failed,
# this gate stops the branch from being created in the human's own project.
# Branch off origin/main (fall back to local HEAD if the fetch failed).
[ -f scripts/pixel.js ] && { git checkout -q -b art/<slug> origin/main 2>/dev/null \
  || git checkout -b art/<slug>; }                        # slug: lowercase letters, digits, hyphens
ME=$(gh api user -q .login 2>/dev/null)                   # if this fails, just ask at step 4
curl -sf https://overwrite.place/data/current.json -o /tmp/current.json  # needed at step 5; -f keeps a 404 page out of the file
```

**After cloning, tell them where the repository landed** (one sentence, no need
to ask) — the current directory may well be their own project, and no repo
should quietly grow inside it. Not having `gh` blocks nothing.

## 3. Draw — one look at the image per revision

**Draw in code — not by hand-writing 64 rows of strings, and not with image
generation or Computer Use.** "Drawing" here is programmatic pixel work:
primitives plus colour mixing, producing a 64×64 indexed grid directly.
Generative models output continuous-tone photographic images; converting one
is a detour that surrenders control. Reference photos have a built-in path
(below). Script goes in `drafts/<slug>.js` (gitignored, never committed):

```js
import { canvas, C, save } from '../scripts/pixel.js';   // plus load, when continuing someone's piece

const art = canvas(C.paper);
art.rect(0, 0, 64, 40, C.blue);               // sky
art.disc(46, 12, 7, C.ochre);                 // moon
art.dither(0, 0, 64, 40, C.slate, 4);         // night: slate folded into blue makes a ninth blue
art.wave(46, C.moss, { amp: 4, freq: 1.2 });  // horizon

save('submissions/<login>/<slug>.json', { model: 'claude', message: 'one line, ≤60 chars', art });
```

```bash
node drafts/<slug>.js && node scripts/verify.js submissions/<login>/<slug>.json --no-art --png /tmp/draft.png
```

**Then read /tmp/draft.png and look with your own eyes.** Broken proportions,
shapes mushed together, stair-stepped outlines — only the whole image shows
these; 64 rows of digits never will. Tweaking coordinates without looking is
painting blindfolded.

**Primitives**: `fill` `px` `rect` `frame` `line` `disc` `ring` `ellipse` `poly` `tri`
`dither` `checker` `stripes` `wave` `rays` `noise` `mirrorX` `mirrorY` `flipX` `flipY` `replace`
**Colours**: `C.paper`(0) `C.ink`(1) `C.blue`(2) `C.slate`(3) `C.red`(4) `C.ochre`(5) `C.moss`(6) `C.plum`(7)
`pixels[0]` is the top row; origin is top-left. Full example: `examples/waiting-for-rain.js`.

**What to draw and what mood it carries is entirely the human's call — below is
craft discipline, not a taste review.**

**These eight colours are not eight equal options — they are three value
ramps.** Sorted by lightness (L\*, higher is lighter):

```
paper 97 ── ochre 68 ── slate 55 · moss 50 · red 50 ── plum 37 ── blue 30 ── ink 17
```

The three in the middle sit at the same value: they differ in hue only, never
in light. A moss shape on red vanishes the moment you squint, and **moss
dithered into red makes nothing but mud**. The ramps that can carry light are
these:

```
warm / skin / sunset / fire    ink → plum → red   → ochre → paper
cool / night / water / snow    ink → blue → slate → paper
green / fields / hills         ink → blue → moss  → ochre → paper
```

Four disciplines (each checkable on /tmp/draft.png):

1. **The first look is at the silhouette.** Block the subject in with two
   colours only — no features, no local colour, no texture — render it, and
   ask one question with the prompt covered up: can you tell what this is? If
   not, fix the shape. A silhouette that does not read cannot be rescued by
   any amount of colour later.
2. **One picture, one ramp.** Borrow at most one colour from the other two as
   an accent, on under 5% of the canvas — it is the loudest note in the
   picture, so spend it on the eye, the moon, a single fruit, a hem. Dark
   subject against light ground, light subject against dark: the subject and
   the background it touches must be two ramp steps apart, because a
   silhouette is made by what is behind it. Squint at the draft — light, mid
   and dark should stay cleanly separated; if it blurs into one middle grey,
   the values never opened up.
3. **Two colours interleaved make a ninth — but detail runs on a budget.**
   Spend mixing and texture in two or three places per picture, all of them
   where the story lives: rain gets raindrops (sparse, placed one by one),
   moonlight breaks up on the water, a window's glow bleeds two pixels, an
   umbrella gets one shadowed side. Everything else stays clean flat colour.
   Dither only between colours that are adjacent on a ramp — jumping steps
   makes no in-between colour, only speckle.
   A large uniform slab is a sticker; an all-over speckle is noise — the good
   picture sits between: clean structure, plus two or three places that
   breathe.
4. **Compose with nerve.** Let shapes bleed off the canvas, hold large empty
   areas, go hard-asymmetric, let the subject take half the frame. A small
   thing centred in 64×64 = a postage stamp. **Abstraction is fully legal** —
   geometry alone can be the picture; nothing says you must "draw a thing". The
   only boring move on this canvas is playing it safe.

Five traps (each one field-tested the hard way):

- Build forms from geometry, don't chase detail — this resolution rewards flat
  composition and punishes fine rendering
- Mixing does nothing for small things: feather a form under 8px and it turns
  to mush — small objects stay solid
- Directional textures (rain, grass, fur) want `line`/`noise`; dither turns
  them into a window screen
- Primitives clip at the canvas, not at the region you meant — rain that should
  fall only inside a window needs per-point bounds checks
- Stacked ellipses building a form need adjacent widths within 2px, or the
  outline stair-steps

**Given a reference image (a photo, a poster), don't redraw it by eye** —
proportions and values are the machine's job. Create the artwork file first
(an empty base is fine), open the preview, and have them drag the image onto
the page: the browser quantizes it into a 64×64 base draft written straight
into your artwork file; the preview shows it within a second. Then your job
starts: `load()` it and work like an artist — delete text and stray pixels,
flatten the large areas per the detail budget, sharpen the silhouette. Verify
and look at the image as usual.

Continuing someone's piece? `load()` their file and revise — more of a
conversation than repainting.

## 4. Preview at the first decent draft; let them talk while you paint

```bash
node scripts/preview.js submissions/<login>/<slug>.json    # auto-opens a browser; add --no-open when headless
```

**Run it in the background — don't sit on it in the foreground.** The page has
two buttons, "Publish it" and "Let me think"; whichever the human clicks, the
process prints the outcome and exits — their decision reaches you as ordinary
command output.

The page re-reads the file every second — each save shows up on their side. So
**don't wait until it's finished to show them**:

> Preview is up (left: what's on the homepage now; right: yours). I'll keep
> refining — interrupt or comment any time.

Revise until they're happy. If you don't have their GitHub username yet, ask
casually now — the directory name must **exactly equal** it; don't guess and
don't substitute `git config user.name`.

## 5. Publish confirmation — the hard gate

Counts: "publish", "ship it", "submit it", "post it", "go ahead", "send it",
and the preview process printing that the human clicked **"Publish it"**.
**Does not count**: "nice", "looks good", "cool", "ok", "yeah" — those judge
the picture. The "Let me think" button doesn't count either: go back to the
conversation, ask what to change, reopen the preview after.

Praise without confirmation gets one question, then you wait:

> Confirm publish? It will replace the artwork on the homepage.

**If the author in /tmp/current.json is their own login**, fold the cost into
the same question:

> The homepage is currently your own "XX" — overwriting it closes its run.
> Confirm publish?

No explicit confirmation, no step 6. If they say "save it for later":
`git add submissions/ && git commit -m "<message>"`, tell them the branch name
and "say the word when you want it out", then **stop** — no polling, no waiting.

## 6. Open the PR

The commit message and PR title are both that one-line message. **Only your one
file under `submissions/` may be added** — touch anything else and CI rejects.

**Do not open it as a draft** (no `--draft`). Your usual habit may be to draft
first and mark it ready later; not here. The merge queue skips drafts, so the
artwork would pass verification and then sit there forever. If one does go up
as a draft, `gh pr ready` releases it.

With `gh`:

```bash
# Single quotes around the message — $ and backticks inside it must not expand
git add submissions/ && git commit -m '<message>'
# push to origin is rejected for non-collaborators — expected; fall through to
# fork. No 2>/dev/null swallowing the reason: network and auth failures take
# this branch too, and you need to see which one it was
git push -u origin art/<slug> \
  || { gh repo fork mazzzystar/overwrite.place --remote --remote-name fork \
       && git push -u fork art/<slug>; } \
  && gh pr create --repo mazzzystar/overwrite.place --title '<message>' --body 'Overwrite the current artwork'
```

Without `gh` (two clicks, nothing installed; `git push` uses their own git
credentials):

1. Have them open `https://github.com/mazzzystar/overwrite.place/fork` and
   click Create fork
2. `git remote add fork https://github.com/<login>/overwrite.place.git && git push -u fork art/<slug>`
3. Hand them this link — it opens a pre-filled PR page:
   `https://github.com/mazzzystar/overwrite.place/compare/main...<login>:overwrite.place:art/<slug>?expand=1`

Finish by giving them the PR link: once CI passes it merges on its own and
takes the homepage, about two minutes end to end (the only wait: the current
artwork's guaranteed minute, if it hasn't had it). The queue lives at
https://overwrite.place/#queue .

## Rules

- No submission limits; you may overwrite your own artwork, but they nod first
  (see step 5)
- Every artwork gets one guaranteed minute; your only score is how long it
  survives, you cannot control it, do nothing in its name
- Rejected by CI? Read its comment and fix accordingly; don't try to route
  around it — new accounts and altered timestamps do nothing, it reads git
  history
- Rules change; the current version is https://overwrite.place/guide . A
  long-running loop shouldn't cache this document as permanent truth — but
  **don't auto-refetch it on a schedule either**; when to reread is the
  human's call
