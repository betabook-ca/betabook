#!/usr/bin/env sh
# Claude Code WorktreeRemove hook: delete the worktree directory, its branch and
# the create hook's sidecar log once a session is done with the worktree.
#
# Defining WorktreeCreate takes over creation, and the runtime will not clean up
# a hook-created worktree by itself — it reports "no WorktreeRemove hook is
# enabled here (hooks are disabled, or the repo defines only WorktreeCreate)"
# and leaves the directory behind. That is why .claude/worktrees/ filled up.
#
# Contract, per the runtime's own hook help: stdin is JSON with worktree_path
# (absolute path to the worktree); exit 0 means removed, any other exit shows
# stderr to the user. The create hook's documented stdin fields did not all
# exist in this build, so every field is read defensively here too.
set -eu

input=$(cat)
field() { printf '%s' "$input" | jq -r "$1 // empty" 2>/dev/null || true; }

fail() {
  echo "$1" >&2
  exit 1
}

# Absolute, symlink-free form of a directory that exists; empty otherwise.
realdir() {
  [ -d "$1" ] || return 0
  (cd "$1" 2>/dev/null && pwd -P) || true
}

worktree_path=$(field '.worktree_path')
[ -n "$worktree_path" ] || fail "WorktreeRemove hook: stdin carried no worktree_path"
case "$worktree_path" in
  /*) ;;
  *) fail "WorktreeRemove hook: worktree_path is not absolute: $worktree_path" ;;
esac

name=$(basename "$worktree_path")
parent=$(dirname "$worktree_path")

# The owning checkout comes from the path itself, never from the environment: a
# --worktree session's CLAUDE_PROJECT_DIR can be the worktree being removed.
# Anything that is not <git checkout>/.claude/worktrees/<name> is refused, so a
# bad worktree_path cannot turn into an rm -rf of a checkout or of $HOME.
repo_real=$(realdir "$(dirname "$(dirname "$parent")")")
[ -n "$repo_real" ] || fail "WorktreeRemove hook: no checkout above $worktree_path"
git -C "$repo_real" rev-parse --is-inside-work-tree >/dev/null 2>&1 ||
  fail "WorktreeRemove hook: $repo_real is not a git checkout"

managed="${repo_real}/.claude/worktrees"
case "$name" in
  ""|.|..|*/*) fail "WorktreeRemove hook: refusing to delete a worktree named '$name'" ;;
esac

parent_real=$(realdir "$parent")
if [ -z "$parent_real" ]; then
  git -C "$repo_real" worktree prune >/dev/null 2>&1 || true
  echo "$worktree_path"
  exit 0
fi
[ "$parent_real" = "$managed" ] ||
  fail "WorktreeRemove hook: $worktree_path is not directly under ${managed}, refusing to delete"
target_real="${parent_real}/${name}"

if [ -L "$target_real" ]; then
  # Deleting through a symlink would reach outside the managed directory.
  rm -f "$target_real"
elif [ -d "$target_real" ]; then
  # --force twice: the first overrides untracked/ignored files (node_modules, a
  # seeded .wrangler), the second a worktree still locked by a dead session.
  git -C "$repo_real" worktree remove --force --force "$target_real" >/dev/null 2>&1 ||
    rm -rf "$target_real" ||
    fail "WorktreeRemove hook: could not delete $target_real"
fi
[ ! -e "$target_real" ] || fail "WorktreeRemove hook: $target_real is still there after removal"

git -C "$repo_real" worktree prune >/dev/null 2>&1 || true

# The create hook writes these next to the worktree; they are the same litter.
rm -f "${parent}/${name}.create.log" "${parent}/${name}.input.json"

# Only the branch the create hook generated, and only when git agrees it is
# merged — -d refuses to drop unmerged commits, which is the point.
git -C "$repo_real" branch -d "worktree-${name}" >/dev/null 2>&1 || true

echo "$target_real"
