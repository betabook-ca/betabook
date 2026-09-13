---
name: create-betabook-pr
description: >-
  Prepare, test, showcase, push, and create or refresh a pull request for the Betabook
  repository. Use when asked to create, open, prepare, or update a Betabook PR and the work
  should be verified against this repo's Husky checks, seeded Next.js/Cloudflare/D1 development
  environment, and GitHub CI. Includes focused feature tests, browser verification, and visual
  evidence through the github-upload-image-to-pr skill. Do not use for PR review, merge, or deploy
  requests.
---

# Create a Betabook PR

Deliver a reviewable PR for exactly the intended change, with automated coverage, manual feature
verification when the behavior is user-observable, and evidence in the description. Creating a PR
authorizes the normal commits, push, and PR creation or update needed for that request; it does not
authorize merging, deploying, adding reviewers, or including unrelated working-tree changes.

## Establish the PR scope

1. Read the repository `AGENTS.md` and inspect the checkout and its remotes:

   ```bash
   git status --short --branch
   git remote -v
   git branch --show-current
   ```

   Treat local modifications and untracked files as user work until the intended PR paths are clear.
   Never stage `.dev.vars`, local D1 state, `.next`, `.open-next`, or screenshot-upload staging files.

2. Resolve the head and upstream repositories before comparing changes or looking for a PR.
   Identify the intended push remote (`push_remote`, normally `origin`) from the branch's Git
   configuration and remote URLs. Read its actual push URL with
   `git remote get-url --push "$push_remote"`, extract its GitHub owner/repository from the SSH or
   HTTPS URL, and query that repository explicitly:

   ```bash
   gh api "repos/$remote_repo" --jq '{full_name, fork, parent: .parent.full_name, source: .source.full_name, default_branch}'
   ```

   Use the returned canonical `full_name` as `head_repo`; old remote URLs can redirect after an
   account or repository rename. When `fork` is true, set `pr_repo` to the upstream repository
   identified by `parent.full_name`; if the parent is itself a fork, resolve the upstream through
   `source.full_name`. Otherwise, `pr_repo` is `head_repo`. Keep pushes on the intended head remote.
   Do not infer fork status from the remote's name, assume `origin` is upstream, or rely on the
   implicit repository chosen by `gh`. If metadata is unavailable or the intended head repository
   is ambiguous, resolve that before creating a PR; do not silently fall back to the fork.

   Use the explicitly requested base branch, or query `repos/$pr_repo` for its default branch
   (`base_branch`, normally `main`). Reuse a remote
   pointing to that canonical repository as `base_remote`, or add an `upstream` remote when the
   name is free; never overwrite a different existing remote. Fetch the base branch and use
   `base_ref="$base_remote/$base_branch"` for all scope and diff checks. A fork's `origin/main`
   may be stale or contain fork-only commits and is not the upstream comparison base.

3. If the branch belongs to a `gh stack`, invoke `$gh-stack` and preserve the stack's dependent
   base in `base_branch` and `base_ref`. Use stack-native submit, push, sync, and rebase operations;
   verify the stack targets `pr_repo` before submission. Never flatten a stacked branch into a PR
   against `main` or substitute the fork as its destination.

4. Set `head_owner` from `head_repo` and `branch` from the current branch. If on the default branch
   or a detached HEAD, create a concise feature branch before committing and update `branch`.
   Check for an existing open PR in `pr_repo` using the exact head owner and branch:

   ```bash
   gh api --method GET "repos/$pr_repo/pulls" -f state=open -f head="$head_owner:$branch" \
     --jq '.[] | {number, html_url, base: .base.ref, head: .head.ref, head_repo: .head.repo.full_name}'
   ```

   Confirm the returned `head_repo` matches before reusing a PR; identical branch names can exist
   in different forks.
   Update the upstream PR instead of creating a duplicate. A PR opened within the fork does not
   satisfy this check: create the intended upstream PR and report the misplaced PR without closing
   it unless requested.

5. Inspect every commit and file against the resolved base, not only the unstaged diff:

   ```bash
   git log --oneline "$base_ref..HEAD"
   git diff --stat "$base_ref...HEAD"
   git diff "$base_ref...HEAD"
   ```

   If unrelated work cannot be separated safely, ask the user rather than broadening the PR.

## Test the feature

Start with the smallest tests that exercise the changed behavior. Add or update focused automated
coverage when the behavior is testable at the domain, action, query, route, or component layer.
Do not substitute a screenshot for behavioral coverage. If useful coverage is impractical, explain
the reason and the stronger manual check in the PR.

For any user-observable route, UI, API, authentication, or persistence change, also exercise the
real development app:

1. A fresh worktree is normally bootstrapped by `.husky/post-checkout`. Otherwise, run
   `pnpm install --frozen-lockfile` when dependencies are missing, then `pnpm setup` when
   `.dev.vars` or the local D1 database is missing. `pnpm setup` is idempotent but reruns the seed.
2. Apply new local migrations and any needed seed changes **before** starting the server. The dev
   process holds its D1 handle open; after seeding from another process, restart the server.
3. Run `pnpm dev` in a persistent terminal and read the URL from its output. Next.js 16 records a
   running instance in `.next/dev/lock`; connect to the existing server for this worktree rather
   than starting a duplicate. It compiles routes on first visit, so wait for the tested route to
   finish compiling.
4. For signed-in flows, use the seeded account `dev@example.com` / `password`. Authentication
   trusts local ports 3000 through 3003. If Next selects a higher port, restart it on a free trusted
   port with `pnpm dev -- --port <port>` before testing auth.
5. Use the runtime's built-in browser connector to exercise the complete changed flow, including
   the meaningful success and failure or empty state. For writes, confirm persistence after reload.
   Watch the dev-server output plus browser console and network failures; a page that merely renders
   is not enough when the feature is interactive.

Pure documentation, repository tooling, and test-only changes do not need a dev server or a
manufactured screenshot. For a non-visual API or data feature, put a compact request/result example
in the PR instead.

## Capture the showcase

Capture evidence only after the final behavior is verified:

- For a visible feature, take a focused screenshot of its clearest completed state. Add before/after
  images when the comparison conveys the change better than one image, and add narrow/mobile proof
  when responsive behavior is part of the change.
- Use a short video for motion or a multi-step interaction that a still image cannot explain.
- Crop out unrelated desktop content and private data. Use descriptive filenames and alt text.
- Keep evidence outside tracked source paths. The upload skill may temporarily stage a clean copy in
  the repo for its browser fallback; remove that copy and recheck `git status` afterward.

For every screenshot or video attachment, invoke `$github-upload-image-to-pr` and follow its upload,
placement, fallback, and verification instructions. Let it choose between native `gh --attach` and
browser upload based on the installed GitHub CLI. When native attachment is available and the PR
does not exist yet, attach during `gh pr create` rather than editing afterward.

## Finalize and validate the branch

Stage only explicit in-scope paths and commit them. The pre-commit hook runs `lint-staged`, which
formats staged files other than `pnpm-lock.yaml`; inspect the resulting commit and working tree.

After the final commit, run the local equivalents of the repository gates:

```bash
pnpm check
pnpm exec opennextjs-cloudflare build
git diff --check "$base_ref...HEAD"
git status --short
```

`pnpm check` is the exact Husky pre-push check: lint, format check, dead-code analysis, Next route
type generation plus TypeScript, and the Vitest suite. GitHub's PR job repeats those checks and adds
the OpenNext Cloudflare build. Fix in-scope failures and rerun the affected checks plus the full
command. Never use `--no-verify`; the eventual push must run `pnpm check` again through the hook.
Do not create a ready-for-review PR with a known failure. Create a draft only when the user asked
for one or explicitly wants incomplete work published.

## Write and create the PR

Use an imperative, specific title. Keep the description factual and omit empty sections:

```markdown
## Summary

- What changed and why
- Important implementation or product detail

## Verification

- `pnpm check`
- `pnpm exec opennextjs-cloudflare build`
- Manual: exact route, account state, viewport, and behavior exercised

## Showcase

Short caption explaining what the image, video, or request/result demonstrates.
```

Mention migrations, compatibility constraints, or follow-ups only when relevant. Include an issue
closing keyword only when the user identified that issue. Never claim a command or manual scenario
that was not actually completed.

For a normal branch, push to the resolved head remote and create the PR explicitly in `pr_repo`.
Set `pr_head="$head_owner:$branch"` for a fork, or `pr_head="$branch"` when both repositories are
the same. Write the exact multiline description to `body_file` and use:

```bash
git push --set-upstream "$push_remote" "$branch"
gh pr create --repo "$pr_repo" --base "$base_branch" --head "$pr_head" \
  --title "$pr_title" --body-file "$body_file"
```

For example, a branch pushed to `tiffany-ko/betabook` must use
`--repo betabook-ca/betabook --base main --head tiffany-ko:<branch>`. Resolve these values from
metadata each time rather than hardcoding this example. For an organization-owned fork where the
CLI does not support the owner-qualified head, use GitHub's pull-request API with the same explicit
base repository and head repository instead of changing the destination.

For a stack, use `$gh-stack` and its computed base. If a PR already exists, edit its title/body and
attach new evidence without duplicating existing images. Scope every PR edit, view, check, and
attachment to the verified upstream PR URL or `--repo "$pr_repo"` with its PR number. Allow the
pre-push hook to finish, then verify the PR with `gh pr view`, including its URL, title, base/head
repositories and branches, description, and rendered media.

Fork PR checks run in the upstream repository. If GitHub reports that a workflow requires maintainer
approval, report that pending approval and link the run. The policy is an upstream Actions setting,
not a missing workflow trigger.
Do not change repository approval policy or switch to `pull_request_target` as part of creating a PR.
Report the PR URL, the tests and manual scenarios completed, and whether GitHub checks are passing or
still pending. Do not merge or deploy the PR.
