#!/usr/bin/env bash
# JusticeUpgrade one-shot verification, from a fresh clone. No keys, no wallet,
# no local node, no GenLayer Studio account.
#
#   bash scripts/verify.sh            (run from anywhere inside the repo)
#
# Steps (each one is reported PASS/FAIL in a summary table):
#   1 setup: fresh .venv + pinned Python tools (requirements.txt)
#   2 genvm-lint check: AST safety lint + GenVM SDK semantic validation
#   3 genvm-lint schema: the contract's ABI extracts
#   4 contract tests: 144 direct-mode pytest tests, real GenVM v0.2.16 SDK, LLM mocked
#   5 setup: web/ npm ci (package-lock.json)
#   6 web build (esbuild bundle + evidence index)
#   7 web unit tests (node only, no browser, no network)
#   8 LIVE read-only check against the deployed contract on studionet:
#     deployed code sha256 == contracts/justice_upgrade.py, get_rules,
#     get_ruling, and all 18 recorded transactions FINALIZED as recorded.
#     Read-only: nothing is signed or sent. Skip with JU_SKIP_LIVE=1 (offline).
# Ends with "VERIFY: PASS" and exit 0 only if every step passed.
#
# Needs: Python 3.12+ (with the venv module; Debian/Ubuntu: apt install
# python3-venv), Node 20+ with npm, git, and internet access (PyPI, npm, a
# one-time ~200 MB GenVM SDK download from GitHub, and studio.genlayer.com).
# Behind an HTTPS proxy, HTTPS_PROXY is honoured (Node >= 22.21 for step 8).
set -u
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
# Pin the GenVM release used by both genvm-lint and the direct-mode tests, so
# every machine checks against the same SDK the contract targets.
export GENVM_VERSION="${GENVM_VERSION:-v0.2.16}"
# Let Node's fetch (genlayer-js) use HTTPS_PROXY when one is set.
if [ -n "${HTTPS_PROXY:-${https_proxy:-}}" ]; then export NODE_USE_ENV_PROXY=1; fi
# Hide Node's "EnvHttpProxyAgent is experimental" notice; it is not a failure.
export NODE_NO_WARNINGS=1

echo "== JusticeUpgrade verify: $(date -u +%Y-%m-%dT%H:%M:%SZ) =="

# ---- prerequisites (clear messages instead of a stack trace)
PY="${PYTHON:-}"
if [ -z "$PY" ]; then
  for c in python3.13 python3.12 python3 python; do
    if command -v "$c" >/dev/null 2>&1 && "$c" -c 'import sys; sys.exit(sys.version_info < (3, 12))' 2>/dev/null; then PY="$c"; break; fi
  done
fi
if [ -z "$PY" ] || ! "$PY" -c 'import sys; sys.exit(sys.version_info < (3, 12))' 2>/dev/null; then
  echo "VERIFY: FAIL - Python 3.12 or newer is required (found: $(python3 --version 2>&1 || echo none)). Set PYTHON=/path/to/python3.12 if it is installed under another name."
  exit 1
fi
if ! "$PY" -c 'import venv, ensurepip' 2>/dev/null; then
  echo "VERIFY: FAIL - $PY has no venv/ensurepip module. On Debian/Ubuntu: sudo apt install python3-venv (or python3.12-venv)."
  exit 1
fi
if ! command -v node >/dev/null 2>&1 || ! command -v npm >/dev/null 2>&1; then
  echo "VERIFY: FAIL - Node.js 20+ with npm is required for the web build and the live check (https://nodejs.org)."
  exit 1
fi
if ! node -e 'process.exit(Number(process.versions.node.split(".")[0]) >= 20 ? 0 : 1)'; then
  echo "VERIFY: FAIL - Node.js 20+ is required (found $(node --version))."
  exit 1
fi
echo "python: $("$PY" --version 2>&1) ($PY)   node: $(node --version)   npm: $(npm --version)   GenVM SDK: $GENVM_VERSION"

declare -a NAMES=() RESULTS=()
LOGDIR="$(mktemp -d "${TMPDIR:-/tmp}/ju-verify.XXXXXX")"
in_ci() { [ "${GITHUB_ACTIONS:-}" = "true" ]; }
# Output without the GenVM download progress spam.
clean() { tr '\r' '\n' | grep --line-buffered -vE '^\s*$|^Downloading: [0-9.]+/'; }
step() { # name, command...
  local name="$1"; shift
  local n=${#NAMES[@]} log="$LOGDIR/step-${#NAMES[@]}.log" t0=$SECONDS rc
  echo; echo "==> $((n + 1)). $name"; echo "    \$ $*"
  in_ci && echo "::group::$name"
  "$@" 2>&1 | tee "$log" | clean
  rc=${PIPESTATUS[0]}
  in_ci && echo "::endgroup::"
  if [ "$rc" -eq 0 ]; then
    RESULTS+=("PASS")
  else
    RESULTS+=("FAIL")
    echo "[verify] FAIL $name (exit $rc). Last lines:" >&2
    clean < "$log" | tail -n 30 | sed 's/^/[verify]   | /' >&2
    in_ci && echo "::error title=verify step failed: $name::exit $rc: $*"
  fi
  NAMES+=("$name ($((SECONDS - t0))s)")
}
skip() { NAMES+=("$1"); RESULTS+=("SKIP"); echo; echo "==> $(( ${#NAMES[@]} )). $1: SKIPPED ($2)"; }

step "setup: fresh .venv + pinned requirements" bash -c "rm -rf .venv && '$PY' -m venv .venv && .venv/bin/python -m pip install --quiet --upgrade pip && .venv/bin/python -m pip install --quiet -r requirements.txt && .venv/bin/python -m pip freeze | grep -iE '^(genlayer-test|genvm-linter|pytest|genlayer-py)=='"
step "genvm-lint check (lint + SDK validation)" .venv/bin/genvm-lint check contracts/justice_upgrade.py
step "genvm-lint schema (ABI)" bash -c ".venv/bin/genvm-lint schema contracts/justice_upgrade.py > '$LOGDIR/schema.json' && echo \"ABI schema extracted: \$(wc -c < '$LOGDIR/schema.json') bytes\""
# First run downloads the GenVM SDK release (~200 MB) into ~/.cache/gltest-direct.
# The "gltest.config.yaml not found" warning is expected: direct mode uses no network.
step "contract tests (pytest, direct mode, LLM mocked)" .venv/bin/python -m pytest tests -q -p no:cacheprovider
step "setup: web npm ci" bash -c "cd web && npm ci --no-audit --no-fund --loglevel=error"
step "web build" bash -c "cd web && npm run --silent build"
step "web unit tests (node, no network)" bash -c "cd web && node --test --test-reporter=spec test/unit.test.mjs"
if [ "${JU_SKIP_LIVE:-}" = "1" ]; then
  skip "live read-only check (studionet)" "JU_SKIP_LIVE=1"
else
  step "live read-only check (studionet)" bash -c "cd web && node --no-warnings scripts/live-check.mjs"
fi

echo; echo "================ SUMMARY ================"
fail=0; skipped=0
for i in "${!NAMES[@]}"; do
  printf '%-4s  %s\n' "${RESULTS[$i]}" "${NAMES[$i]}"
  [ "${RESULTS[$i]}" = "FAIL" ] && fail=1
  [ "${RESULTS[$i]}" = "SKIP" ] && skipped=1
done
echo "========================================="
rm -rf "$LOGDIR"
if [ $fail -ne 0 ]; then echo "VERIFY: FAIL (see the [verify] FAIL lines above)"; exit 1; fi
if [ $skipped -ne 0 ]; then echo "VERIFY: PASS (offline only: the live check was skipped)"; exit 0; fi
echo "VERIFY: PASS"
