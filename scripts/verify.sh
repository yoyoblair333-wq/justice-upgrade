#!/usr/bin/env bash
# One-shot verification for reviewers: fresh venv, pinned tools, lint, tests.
# Usage: bash scripts/verify.sh        (run from anywhere inside the repo)
set -euo pipefail

cd "$(dirname "$0")/.."
PYTHON="${PYTHON:-python3}"
# Pin the GenVM release used by both genvm-lint and the direct-mode tests.
export GENVM_VERSION="${GENVM_VERSION:-v0.2.16}"

echo "== JusticeUpgrade verify =="
"$PYTHON" - <<'PY'
import sys
if sys.version_info < (3, 12):
    sys.exit(f"Python >= 3.12 required, found {sys.version.split()[0]}")
print(f"python {sys.version.split()[0]} OK")
PY
echo "GenVM SDK release: $GENVM_VERSION"

echo "== 1/4 create fresh virtualenv (.venv) =="
rm -rf .venv
"$PYTHON" -m venv .venv
.venv/bin/pip install --quiet --upgrade pip
.venv/bin/pip install --quiet -r requirements.txt
.venv/bin/pip freeze | grep -iE '^(genlayer-test|genvm-linter|pytest|genlayer-py)=='

echo "== 2/4 genvm-lint check (lint + SDK validation) =="
.venv/bin/genvm-lint check contracts/justice_upgrade.py

echo "== 3/4 ABI schema =="
.venv/bin/genvm-lint schema contracts/justice_upgrade.py > /dev/null && echo "schema extracted OK"

echo "== 4/4 direct-mode tests (real GenVM SDK, LLM mocked) =="
# First run downloads the GenVM SDK release (~200 MB) into ~/.cache/gltest-direct.
.venv/bin/python -m pytest tests -q -p no:cacheprovider

echo "VERIFY: PASS"
