# JusticeUpgrade - GenLayer Intelligent Contract
# make setup   create .venv and install pinned tooling
# make test    run the direct-mode test suite (no network, LLM mocked)
# make lint    genvm-lint: AST safety lint + SDK semantic validation
# make web     web/: npm ci, build, unit tests (node, no browser, no network)
# make live    read-only live check against the deployed contract on studionet
# make verify  everything above, from scratch (same as scripts/verify.sh)

PYTHON ?= python3
VENV   := .venv
BIN    := $(VENV)/bin
CONTRACT := contracts/justice_upgrade.py
export GENVM_VERSION ?= v0.2.16

.PHONY: setup test lint typecheck schema web live verify clean

$(BIN)/pytest: requirements.txt
	$(PYTHON) -m venv $(VENV)
	$(BIN)/pip install --quiet --upgrade pip
	$(BIN)/pip install --quiet -r requirements.txt
	@touch $(BIN)/pytest

setup: $(BIN)/pytest

test: setup
	$(BIN)/python -m pytest tests -q

lint: setup
	$(BIN)/genvm-lint check $(CONTRACT)

# Optional: needs a `pyright` binary on PATH (npm i -g pyright).
typecheck: setup
	$(BIN)/genvm-lint typecheck $(CONTRACT)

schema: setup
	$(BIN)/genvm-lint schema $(CONTRACT)

web:
	cd web && npm ci --no-audit --no-fund && npm run build && npm run test:unit

# Read-only (nothing is signed). Behind an HTTPS proxy: NODE_USE_ENV_PROXY=1 make live
live:
	cd web && ( [ -d node_modules ] || npm ci --no-audit --no-fund ) && npm run live-check

verify:
	bash scripts/verify.sh

clean:
	rm -rf $(VENV) .pytest_cache tests/direct/__pycache__ artifacts
