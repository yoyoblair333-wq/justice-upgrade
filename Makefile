# JusticeUpgrade - GenLayer Intelligent Contract
# make setup   create .venv and install pinned tooling
# make test    run the direct-mode test suite (no network, LLM mocked)
# make lint    genvm-lint: AST safety lint + SDK semantic validation
# make verify  everything above, from scratch (same as scripts/verify.sh)

PYTHON ?= python3
VENV   := .venv
BIN    := $(VENV)/bin
CONTRACT := contracts/justice_upgrade.py
export GENVM_VERSION ?= v0.2.16

.PHONY: setup test lint typecheck schema verify clean

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

verify:
	bash scripts/verify.sh

clean:
	rm -rf $(VENV) .pytest_cache tests/direct/__pycache__ artifacts
