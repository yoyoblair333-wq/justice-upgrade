# JusticeUpgrade

An on-chain AI arbiter for everyday agreements, written as a GenLayer Intelligent Contract.

Two people record a plain-English agreement on-chain, such as a roommates' chore split, a house rule, or who gets credit for which part of a group project. If they later disagree, either one files a dispute and the other may respond. An LLM running inside the GenVM then gives a **bounded ruling**: `PARTY_A`, `PARTY_B`, `SPLIT` or `INSUFFICIENT_EVIDENCE`. Each GenLayer validator re-judges the dispute on its own model. A validator accepts the leader's result only if it reaches the **same ruling**.

The contract holds no funds and moves no value. It is not an escrow, a payment tool, a delivery checker, or a work or credential verifier. It records text and gives a neutral reading of the parties' own agreement.

---

## Verify in 5 minutes (for GenLayer stewards)

You need Python 3.12 or newer, `git` and an internet connection (for pip and a one-time GenVM SDK download). You do not need a node, Studio, an API key or a wallet.

```bash
git clone https://github.com/yoyoblair333-wq/justiceupgrade-app.git
cd justiceupgrade-app
bash scripts/verify.sh
```

`verify.sh` builds a fresh `.venv`, installs the pinned tools in `requirements.txt`, runs `genvm-lint check` (AST lint plus SDK semantic validation), extracts the ABI schema, and runs the direct-mode test suite against the real GenVM v0.2.16 Python SDK with the LLM mocked.

**Expected output** (the full log from a fresh clone is in [`docs/VERIFY_LOG.md`](docs/VERIFY_LOG.md)):

```
== JusticeUpgrade verify ==
python 3.1x.x OK
GenVM SDK release: v0.2.16
== 1/4 create fresh virtualenv (.venv) ==
genlayer-py==0.16.3
genlayer-test==0.29.2
genvm-linter==0.11.0
pytest==9.1.1
== 2/4 genvm-lint check (lint + SDK validation) ==
✓ Lint passed (3 checks)
✓ Validation passed
  Contract: JusticeUpgrade
  Methods: 12 (6 view, 6 write)
== 3/4 ABI schema ==
schema extracted OK
== 4/4 direct-mode tests (real GenVM SDK, LLM mocked) ==
........................................................................ [ 50%]
......................................................................   [100%]
144 passed in N.NNs
VERIFY: PASS
```

On the first run, pytest prints a `gltest.config.yaml not found ... using default config` warning. This is expected: direct-mode tests never contact a network, so no network config is needed. The first run also downloads the GenVM v0.2.16 release (about 200 MB) once for the linter (`~/.cache/genvm-linter`) and once for the tests (`~/.cache/gltest-direct`). Later runs take a few seconds. Both tools are pinned to v0.2.16 through `GENVM_VERSION`, so every machine checks against the same SDK.

The same steps, one at a time:

```bash
make setup   # .venv + pinned requirements
make lint    # genvm-lint check contracts/justice_upgrade.py
make test    # pytest tests -q   -> 144 passed
```

CI runs `scripts/verify.sh` on every push ([`.github/workflows/ci.yml`](.github/workflows/ci.yml)).

To deploy and try it live, follow [`deploy/STUDIO_DEPLOY.md`](deploy/STUDIO_DEPLOY.md). It covers GenLayer Studio step by step and gives copy-paste arguments for a full run.

---

## Deployment evidence — TO FILL AFTER DEPLOY

> **TO FILL AFTER DEPLOY.** These values do not exist yet. They come from a live deployment made by following `deploy/STUDIO_DEPLOY.md`. Every placeholder below is still unfilled.

| Item | Value |
|---|---|
| Network | `TO FILL AFTER DEPLOY` (e.g. Studionet / Testnet Bradbury) |
| Contract address | `TO FILL AFTER DEPLOY` |
| Deploy transaction | `TO FILL AFTER DEPLOY` |
| `create_agreement` tx | `TO FILL AFTER DEPLOY` |
| `accept_agreement` tx | `TO FILL AFTER DEPLOY` |
| `file_dispute` tx | `TO FILL AFTER DEPLOY` |
| `respond` tx | `TO FILL AFTER DEPLOY` |
| `resolve_dispute` tx (ruling + consensus result) | `TO FILL AFTER DEPLOY` |
| Rejected injection attempt tx (expected revert) | `TO FILL AFTER DEPLOY` |
| `get_ruling("chores-1")` output | `TO FILL AFTER DEPLOY` |
| Demo video | `TO FILL AFTER DEPLOY` |

---

## How it works

### Lifecycle

```
PROPOSED --accept_agreement (party B)--> ACTIVE --file_dispute (A or B)--> DISPUTED
    |                                                                         |
    +--cancel_agreement (A or B)--> CANCELLED          respond (the other party, once,
                                                         before the response deadline)
                                                                              |
                                  resolve_dispute (A or B; after a response, or once
                                  the response window has closed) --> RESOLVED (final)
```

Status is an explicit enum: `PROPOSED`, `ACTIVE`, `DISPUTED`, `RESOLVED`, `CANCELLED`. Every write checks for the exact status it needs and reverts otherwise. An unknown status value also reverts.

### Consensus on a subjective judgment

1. **Bounded output.** The model must return one of four rulings. A well-formed reply with any other ruling is coerced to `INSUFFICIENT_EVIDENCE`, the only ruling that favours nobody. The result records `coerced: true` when this happens.
2. **Independent re-judgment.** `gl.vm.run_nondet_unsafe(leader_fn, validator_fn)`: the leader produces a verdict. Each validator first checks the leader's payload shape, then runs the same prompt on its own model, and agrees only if its ruling matches. The reasoning text may differ between validators; the ruling may not.
3. **Fail closed.** If the leader fails or the payload is tampered with or out of set, the validator votes disagree. It also votes disagree if its own model call fails or returns a different ruling. If most validators disagree, GenLayer does not commit the result.

### Prompt-injection hardening

All party text (terms, dispute, response) goes through these steps:

- NFKC-normalised, so full-width look-alike letters become plain letters.
- Stripped of zero-width, soft-hyphen, BOM and bidi-override characters, and of other control or format characters (newline and tab are kept).
- Length-capped: terms 2000 characters, each statement 1500.
- Rejected if it contains phrases aimed at the arbiter, for example "ignore previous instructions", "system prompt", "you are now a judge…", "respond only with JSON", the literal ruling labels `PARTY_A`/`INSUFFICIENT_EVIDENCE`, a `"ruling":` key, `<<<`/`>>>` delimiters, code fences, or `[INST]`/`<system>` tags. The patterns are deliberately narrow, and tests confirm that ordinary speech still passes ("she keeps ignoring the rules we agreed on", "you are now two weeks behind on the dishes").
- Placed in the prompt **after** a fixed-rules block, inside `<<<BEGIN_…>>>`/`<<<END_…>>>` delimiters that the rules declare to be untrusted data.

### Contract API

| Method | Kind | Who | Purpose |
|---|---|---|---|
| `create_agreement(agreement_id, party_b, terms, response_window_hours)` | write | anyone (becomes PARTY_A) | Propose terms to PARTY_B. Window: 1 to 720 hours. |
| `accept_agreement(agreement_id)` | write | PARTY_B | `PROPOSED → ACTIVE` |
| `cancel_agreement(agreement_id)` | write | A or B | `PROPOSED → CANCELLED` |
| `file_dispute(agreement_id, statement)` | write | A or B | `ACTIVE → DISPUTED`; opens the response window |
| `respond(agreement_id, statement)` | write | the non-filing party | One response, before the deadline |
| `resolve_dispute(agreement_id)` | write | A or B | LLM ruling with validator consensus; `DISPUTED → RESOLVED` |
| `get_agreement(agreement_id)` | view | | Full record |
| `get_ruling(agreement_id)` | view | | Status, ruling, reasoning, resolution, coerced |
| `get_status(agreement_id)` | view | | Status string |
| `get_agreement_count()` / `list_agreement_ids(offset, limit)` | view | | Enumeration (limit capped at 100) |
| `get_rules()` | view | | Ruling set, status set, caps, `holds_funds: false` |

**Events** (`gl.Event`, indexed by `agreement_id`): `AgreementProposed`, `AgreementAccepted`, `AgreementCancelled`, `DisputeFiled`, `DisputeResponded`, `DisputeResolved`.

**Errors:** guard failures revert with an `[EXPECTED] …` message. Malformed model output reverts with `[LLM_ERROR] …`, and the agreement stays `DISPUTED` so the ruling can be retried.

### Example (roommates' chore agreement)

```python
# Ana (PARTY_A) proposes; Ben (PARTY_B) accepts
create_agreement("chores-1", "<Ben's address>",
  "Roommates' chore agreement. Ana (party A) takes out the trash every Monday and Thursday night. "
  "Ben (party B) washes the dishes every evening before 11pm. Whoever misses a turn does the other "
  "person's chore the next day.", 48)
accept_agreement("chores-1")                       # as Ben
file_dispute("chores-1", "Ben skipped the dishes on Tuesday and Wednesday night.")   # as Ana
respond("chores-1", "I was sick on Tuesday. I did skip Wednesday.")                  # as Ben
resolve_dispute("chores-1")                        # as either
# -> {"ruling": "PARTY_A" | "SPLIT" | ..., "reasoning": "...", "resolution": "...", "coerced": false}
```

---

## Tests

There are 144 direct-mode tests in `tests/direct/`. They run in-process against the real GenVM Python SDK with LLM calls mocked by regex. The fixtures `direct_vm`, `direct_deploy`, `direct_alice`, `direct_bob` and `direct_charlie` come from the `genlayer-test` pytest plugin. `tests/direct/conftest.py` adds the deploy fixture, a clock helper and event capture.

| File | Tests | Covers |
|---|---|---|
| `test_lifecycle.py` | 4 | Full chores flow with events; group-project SPLIT filed by party B; ruling after the window closes with no response; cancelling a proposal |
| `test_access_control.py` | 9 | Strangers cannot accept, cancel, dispute, respond or resolve; party A cannot accept its own proposal; the filer cannot respond to its own dispute; either party can resolve |
| `test_state_guards.py` | 13 | Duplicate id; disputing before acceptance or after cancel; double accept; resolving without a dispute; second dispute; double response; deadline edges; resolving while the window is open; **double-resolve**; finality; unknown id |
| `test_input_guards.py` | 25 | **Empty** terms or statements (including invisible-only); length caps at the boundary; id charset and length; invalid or self `party_b`; window bounds and type |
| `test_injection.py` | 52 | 17 **injection** phrases rejected in terms, disputes and responses; zero-width, full-width and soft-hyphen obfuscation; bidi stripping; ordinary speech allowed; prompt places rules before delimited data |
| `test_llm_output.py` | 19 | **Out-of-set coercion**; case and spacing normalisation; malformed replies fail closed and stay retryable; fenced JSON; truncation |
| `test_validator.py` | 17 | Validator agrees on the same ruling with different wording; **disagrees on a different ruling (no consensus)**, on its own model failure, on a leader error and on 8 tampered payloads |
| `test_views.py` | 3 | Rules view, pagination, record shape |
| `test_studio_example.py` | 2 | Runs the exact copy-paste arguments from `deploy/STUDIO_DEPLOY.md`, so the guide cannot drift from the contract |

**What direct mode cannot show:** direct mode runs the leader once and replays the captured validator function with `direct_vm.run_validator()`. It proves what each validator votes. It cannot show the network step where a majority of disagree votes leads to leader rotation. That step, and real-model behaviour, need a live deployment (see `deploy/STUDIO_DEPLOY.md`).

---

## Repository layout

```
contracts/justice_upgrade.py    the Intelligent Contract
tests/direct/                   direct-mode tests + conftest.py
scripts/verify.sh               one-shot reviewer verification
deploy/STUDIO_DEPLOY.md         GenLayer Studio deployment + full example run
docs/VERIFY_LOG.md              output of verify.sh from a fresh clone
requirements.txt                pinned: genlayer-test 0.29.2, genvm-linter 0.11.0, pytest 9.1.1
Makefile                        setup / test / lint / verify
.github/workflows/ci.yml        CI: runs scripts/verify.sh
```

## SDK target and known caveats

- The contract targets the GenVM **v0.2** Python SDK (runner hash `py-genlayer:1jb45aa8…` in the file header, the same one the official `genlayer-project-boilerplate` uses). It was validated with `genvm-linter` 0.11.0 against GenVM v0.2.16. If the network you deploy to has moved to SDK v0.3, the import and storage names change; check before deploying.
- The response window uses the transaction datetime (`gl.message_raw["datetime"]`). Its format is handled for `…Z` and `±HH:MM` ISO strings. Confirm it on one live transaction.
- Rulings come from LLMs and are advisory. Different validator models can disagree on close cases. When that happens the transaction does not reach consensus, which is the intended fail-closed behaviour.

## Lineage

JusticeUpgrade has the same author as **VERDICT**. JusticeUpgrade is the developer primitive: a small, reusable contract for disputes over a written agreement between two parties. VERDICT is the consumer entertainment app (light-hearted "who's right?" contests). The two are separate codebases.

## License

MIT, see [`LICENSE`](LICENSE).

#JusticeNeedsAnUpgrade
