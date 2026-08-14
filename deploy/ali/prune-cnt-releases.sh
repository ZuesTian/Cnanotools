#!/usr/bin/env bash
set -euo pipefail

keep_rollbacks=${KEEP_ROLLBACKS:-2}
dry_run=${DRY_RUN:-0}

[[ "$keep_rollbacks" =~ ^[0-9]+$ ]] || {
  echo "KEEP_ROLLBACKS must be a non-negative integer" >&2
  exit 2
}
[[ "$dry_run" == 0 || "$dry_run" == 1 ]] || {
  echo "DRY_RUN must be 0 or 1" >&2
  exit 2
}

exec 9>/run/cnt-release-prune.lock
flock -n 9 || {
  echo "another release-prune process is already running"
  exit 0
}

application_roots=(
  /opt/opt-cnt
  /opt/tem-cnt/frontend
  /opt/cnt-production
  /opt/grainpeak
  /opt/uv-spectrum
  /opt/ramanfit
)

contains_path() {
  local expected=$1
  shift
  local candidate
  for candidate in "$@"; do
    [[ "$candidate" == "$expected" ]] && return 0
  done
  return 1
}

for application_root in "${application_roots[@]}"; do
  releases_root="$application_root/releases"
  current_link="$application_root/current"
  [[ -d "$releases_root" && -L "$current_link" ]] || continue

  releases_root=$(readlink -f "$releases_root")
  current_release=$(readlink -f "$current_link")
  [[ -d "$current_release" && "$current_release" == "$releases_root/"* ]] || {
    echo "unsafe current release for $application_root: $current_release" >&2
    exit 3
  }

  mapfile -t candidates < <(
    find "$releases_root" -mindepth 1 -maxdepth 1 -type d \
      -printf '%T@ %p\n' | sort -rn | cut -d' ' -f2-
  )

  keep=("$current_release")
  retained_rollbacks=0
  for candidate in "${candidates[@]}"; do
    [[ "$candidate" == "$current_release" ]] && continue
    if (( retained_rollbacks < keep_rollbacks )); then
      keep+=("$candidate")
      ((retained_rollbacks += 1))
    fi
  done

  for candidate in "${candidates[@]}"; do
    contains_path "$candidate" "${keep[@]}" && continue
    resolved_candidate=$(readlink -f "$candidate")
    [[ -d "$resolved_candidate" && ! -L "$candidate" ]] || {
      echo "refusing non-directory release: $candidate" >&2
      exit 4
    }
    [[ "$(dirname "$resolved_candidate")" == "$releases_root" ]] || {
      echo "refusing release outside $releases_root: $resolved_candidate" >&2
      exit 4
    }
    bytes=$(du -s -B1 "$resolved_candidate" | awk '{print $1}')
    echo "prune release bytes=$bytes path=$resolved_candidate"
    [[ "$dry_run" == 1 ]] || rm -rf -- "$resolved_candidate"
  done
done
