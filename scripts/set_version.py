#!/usr/bin/env python3

import json
import re
import sys
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parent.parent
MANIFEST_PATH = REPO_ROOT / "manifest.json"
README_PATH = REPO_ROOT / "README.md"
VERSION_PATTERN = re.compile(r"^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$")
README_VERSION_PATTERN = re.compile(r"^- Version:\s+.*$", re.MULTILINE)


def main() -> int:
  if len(sys.argv) != 2:
    print("Usage: python3 scripts/set_version.py <version>", file=sys.stderr)
    return 1

  version = sys.argv[1].strip()
  if not VERSION_PATTERN.fullmatch(version):
    print(f"Invalid version: {version}", file=sys.stderr)
    return 1

  update_manifest(version)
  update_readme(version)
  print(f"Set version to {version}")
  return 0


def update_manifest(version: str) -> None:
  manifest = json.loads(MANIFEST_PATH.read_text())
  manifest["version"] = version
  MANIFEST_PATH.write_text(json.dumps(manifest, indent=2) + "\n")


def update_readme(version: str) -> None:
  readme = README_PATH.read_text()
  updated, replacements = README_VERSION_PATTERN.subn(f"- Version: {version}", readme, count=1)
  if replacements != 1:
    raise RuntimeError("Could not find README version line to update")

  README_PATH.write_text(updated)


if __name__ == "__main__":
  raise SystemExit(main())
