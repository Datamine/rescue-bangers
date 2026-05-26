#!/usr/bin/env bash

set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
manifest_path="$repo_root/manifest.json"
version="$(sed -n 's/^[[:space:]]*"version":[[:space:]]*"\([^"]*\)".*/\1/p' "$manifest_path" | head -n 1)"

if [[ -z "$version" ]]; then
  echo "Could not read version from $manifest_path" >&2
  exit 1
fi

output_path="${1:-$repo_root/x-banger-rescue-$version.zip}"
output_dir="$(dirname "$output_path")"
output_name="$(basename "$output_path")"

mkdir -p "$output_dir"

tmp_output="$(mktemp "/tmp/x-banger-rescue.XXXXXX.zip")"
trap 'rm -f "$tmp_output"' EXIT
rm -f "$tmp_output"

(
  cd "$repo_root"
  zip -rq "$tmp_output" . \
    -x ".git/*" ".git" ".gitignore" "*/.gitignore" "$output_name"
)

mv "$tmp_output" "$output_path"
trap - EXIT

echo "Wrote $output_path"
