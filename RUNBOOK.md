# Runbook

Operational procedures. The takedown one exists because the site publishes
third-party content without prior review — the ability to remove something has
to be ready *before* it is needed, not designed while something offensive is on
the homepage.

---

## First-time deploy setup

Two steps need credentials that no script here holds. Both are done once.

**1. DNS for the custom domain.** The Pages project already claims
`overwrite.place` and `www.overwrite.place`; they sit at `pending` until a DNS
record exists. In the Cloudflare dashboard, either open **Workers & Pages →
overwrite-place → Custom domains** and accept the DNS record it offers, or add
them by hand under the `overwrite.place` zone:

| Type | Name | Target | Proxy |
|---|---|---|---|
| CNAME | `overwrite.place` | `overwrite-place.pages.dev` | Proxied |
| CNAME | `www` | `overwrite-place.pages.dev` | Proxied |

Certificates issue within a few minutes of the record appearing.

**2. The deploy credential.** `deploy.yml` needs an API token with exactly one
permission — **Account → Cloudflare Pages → Edit**. Create it at *My Profile →
API Tokens → Create Token*, then:

```bash
gh secret set CLOUDFLARE_API_TOKEN --repo mazzzystar/overwrite.place
gh workflow run deploy --repo mazzzystar/overwrite.place   # confirm it works
```

`CLOUDFLARE_ACCOUNT_ID` is already set. Until the token exists, deploys can
still be run from a machine with `wrangler login`:

```bash
npm run build && npx wrangler pages deploy dist --project-name overwrite-place --branch main
```

---

## Two settings to check on the first outside contribution

**Does `verify` actually start?** This repository is on GitHub's default
`first_time_contributors` approval policy:

```bash
gh api repos/mazzzystar/overwrite.place/actions/permissions/fork-pr-contributor-approval
```

That policy gates workflows triggered by `pull_request` from a fork until a
maintainer clicks approve. `verify.yml` uses `pull_request_target`, which runs
in the base branch's context and should therefore not be gated — but almost
every contributor here is by definition a first-time contributor, so if the
first outside pull request sits with no `verify` run at all, this is why:

```bash
gh api --method PUT repos/mazzzystar/overwrite.place/actions/permissions/fork-pr-contributor-approval \
  -f approval_policy=never
```

That is only safe while no workflow runs pull-request code. Today none does —
`verify.yml` is `pull_request_target` and reads the pull request as data only.
Adding any `pull_request`-triggered workflow means revisiting this.

**Is CODEOWNERS doing anything?** It is inert unless branch protection requires
code-owner review, and right now `main` only requires the `verify` status check.
The gap it would cover is already closed — the merge queue passes
`--require-kind submission`, so it cannot merge a pull request that changes code
no matter what label it wears. Turning code-owner review on is defence in depth:

```bash
gh api --method PUT repos/mazzzystar/overwrite.place/branches/main/protection --input - <<'EOF'
{ "required_status_checks": { "strict": false, "contexts": ["verify"] },
  "enforce_admins": false,
  "required_pull_request_reviews": { "require_code_owner_reviews": true, "required_approving_review_count": 0 },
  "restrictions": null, "allow_force_pushes": false, "allow_deletions": false }
EOF
```

**Verify before leaving it on.** `CODEOWNERS` ends with a `/submissions/` line
that has no owners, which should exempt artwork from the requirement — but if
that is wrong, the merge queue stops merging everything. Watch the next queue
run before walking away from it.

---

## Taking an artwork down

**Time to complete: about three minutes.** Rehearse it once before launch.

```bash
# 1. Find the commit that added it.
git log --diff-filter=A --format='%H %ct' --name-only -- submissions/ | grep -B2 '<slug>'

# 2. Remove the file. Do NOT revert the commit — a revert of a squashed merge
#    can carry other changes with it, and the file's *first add* is what the
#    timeline keys on either way.
git rm submissions/<login>/<slug>.json
git commit -m "moderation: remove No. <n>"
git push
```

That is the whole takedown. The next build drops it from the site.

What survives on purpose:

- **The number stays retired.** Numbering runs over every artwork ever added,
  so removing No. 7 leaves a gap; it does not renumber No. 8 onward. Links
  people have already shared keep meaning what they meant.
- **Neighbouring lifespans do not change.** No. 6 still counts until No. 7 went
  up, because that is genuinely when No. 6 left the homepage.
- **The file remains in git history.** Removing it from the site is not the same
  as erasing it. For a legal demand that requires true deletion, history has to
  be rewritten with `git filter-repo` and force-pushed, every fork is out of
  reach, and the decision is a person's, not a script's.

Then, if the author should not come back:

```bash
node -e "
const fs=require('fs');
const b=JSON.parse(fs.readFileSync('blocklist.json','utf8'));
b.logins.push('<login>');
fs.writeFileSync('blocklist.json', JSON.stringify(b,null,2)+'\n');"
git commit -am "moderation: block <login>" && git push
```

The blocklist stops future submissions. It does not remove existing ones — do
that separately, above.

Finally, deploy: pushing to `main` runs `deploy.yml` on its own. If it did not,
run it by hand from the Actions tab, or locally:

```bash
npm run build && npx wrangler pages deploy dist --project-name overwrite-place --branch main
```

---

## Adding a blocked term

Terms are stored as salted hashes so that browsing a public repository is not
the same as reading a dictionary of slurs. Add them through stdin, so the
plaintext never reaches your shell history or a diff:

```bash
printf '%s\n' 'term one' 'term two' | node scripts/moderation.js add
node scripts/moderation.js check "一句用来试的附言"   # confirm before committing
git commit -am "moderation: extend the term list" && git push
```

This only filters the 60-character message. It cannot see the picture, and it
is meant to be shallow — the real safety net is the takedown above.

---

## The queue has stopped

`merge.yml` runs on a cron every 15 minutes. Cron on GitHub Actions is
best-effort and can be delayed under load; it is also **disabled automatically
after 60 days without repository activity**, which is the failure mode to
suspect first on a quiet project.

```bash
gh workflow list --repo mazzzystar/overwrite.place
gh workflow enable "merge queue" --repo mazzzystar/overwrite.place
gh workflow run "merge queue" --repo mazzzystar/overwrite.place   # release one now
```

If a pull request is stuck with `verified` but never merges, read the workflow
run: the queue re-checks every rule immediately before merging, so an author who
has since become ineligible (cooldown, or their own artwork went live in the
meantime) gets pushed back with a comment rather than merged.

---

## The site is stale or broken

The homepage is a static file. If it is wrong, the build that produced it was
wrong, and the build is a pure function of the repository.

```bash
npm run build          # reproduce locally; it prints the current artwork
node scripts/verify.js submissions/<login>/<slug>.json
```

The build **refuses to run on a shallow clone**, because lifespans come from
commit timestamps and missing history would silently publish a site where
nothing ever lived. If CI hits that, `actions/checkout` lost its
`fetch-depth: 0`.

To roll the live site back to a previous deployment without touching the
repository, use the Cloudflare Pages dashboard — every deployment stays
addressable, and rollback is instant.

---

## Rotating the deploy credential

`CLOUDFLARE_API_TOKEN` in GitHub repository secrets is the only secret this
project has. It needs exactly one permission: **Account → Cloudflare Pages →
Edit**. If it leaks, the blast radius is this Pages project.

```bash
gh secret set CLOUDFLARE_API_TOKEN --repo mazzzystar/overwrite.place
```

Nothing else in this project takes a credential, and **no contributor is ever
asked for one**. Any instruction that asks a contributor for a token is not
coming from this project.
