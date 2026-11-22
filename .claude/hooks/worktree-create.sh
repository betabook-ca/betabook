#!/usr/bin/env sh
# Claude Code WorktreeCreate hook: create the worktree with a real
# `git worktree add` so .husky/post-checkout bootstraps it.
#
# Claude's built-in creation does not run .husky/post-checkout, so its worktrees
# arrive without node_modules or a seeded D1; this hook replaces it.
#
# Contract, as the runtime actually implements it: the last line of stdout must
# be the directory the hook created, and any non-zero exit aborts creation. The
# published docs describe a JSON result and source_path/worktree_path/is_git
# fields on stdin — this build sends none of them and parses no JSON, so both
# ends are read defensively.
set -eu

input=$(cat)
field() { printf '%s' "$input" | jq -r "$1 // empty" 2>/dev/null || true; }

fail() {
  echo "$1" >&2
  exit 1
}

source_path=$(field '.source_path')
[ -n "$source_path" ] || source_path=$(field '.cwd')
[ -n "$source_path" ] || source_path=${CLAUDE_PROJECT_DIR:-$(pwd)}

# husky resolves its relative core.hooksPath (.husky/_) against the cwd of the
# invoking git process, so post-checkout only fires when git runs from a
# checkout that has it — the main one.
cd "$source_path" || fail "cannot enter $source_path"
git rev-parse --is-inside-work-tree >/dev/null 2>&1 || fail "$source_path is not a git checkout"

worktree_path=$(field '.worktree_path')
if [ -z "$worktree_path" ]; then
  name=$(field '.name')
  [ -n "$name" ] || name="session-$(date +%s)"
  worktree_path="${source_path}/.claude/worktrees/${name}"
fi

name=$(basename "$worktree_path")
branch="worktree-${name}"
parent=$(dirname "$worktree_path")
log="${parent}/${name}.create.log"
mkdir -p "$parent"

[ -d .husky/_ ] || echo "warning: no .husky/_ in $source_path, worktree will not self-bootstrap" >&2

# Claude reads the worktree path off the last line of stdout, so the bootstrap's
# own output (pnpm install, migrations, seed) goes to the log instead.
if git rev-parse --verify "$branch" >/dev/null 2>&1; then
  git worktree add "$worktree_path" "$branch" >"$log" 2>&1 || fail "git worktree add failed for existing branch $branch — see $log"
else
  git worktree add -b "$branch" "$worktree_path" HEAD >"$log" 2>&1 || fail "git worktree add -b $branch failed — see $log"
fi

# git ignores post-checkout's exit status, so a half-finished bootstrap looks
# like a finished one. A bare worktree is still usable, so warn rather than
# abort — aborting would throw away a worktree that only needs `pnpm install`.
[ -d "${worktree_path}/node_modules" ] || echo "worktree created but not bootstrapped — run 'pnpm install && pnpm setup' in ${worktree_path} (log: ${log})" >&2

# Claude reads this as the worktree it should switch into.
echo "$worktree_path"
