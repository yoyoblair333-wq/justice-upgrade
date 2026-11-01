# JusticeUpgrade

An on-chain AI arbiter for everyday agreements, written as a GenLayer Intelligent Contract, with a web app that runs the whole thing from your browser.

**Live app:** https://yoyoblair333-wq.github.io/justiceupgrade-app/ · **Contract (studionet):** `0x189247716CB87661fDae59aA5fc38eb9df1D9c9c` · **Demo video (54 s):** https://yoyoblair333-wq.github.io/justiceupgrade-app/demo/ju-demo.mp4

## Verify in 2 minutes

No API key, wallet, local node or Studio account is needed. You need **Python 3.12+** (with `venv`; on Debian/Ubuntu `sudo apt install python3-venv`), **Node.js 20+** with npm, `git`, `bash` (Linux, macOS or WSL) and internet access.

```bash
git clone https://github.com/yoyoblair333-wq/justiceupgrade-app.git
cd justiceupgrade-app
bash scripts/verify.sh
```

The last line is `VERIFY: PASS` (exit code 0). In order, `verify.sh`:

1. builds a fresh `.venv` with the pinned tools in `requirements.txt`;
2. runs `genvm-lint check` (AST lint + GenVM SDK validation) and extracts the ABI with `genvm-lint schema`;
3. runs the **144 contract tests** (direct mode, real GenVM v0.2.16 SDK, LLM mocked);
4. runs `npm ci`, builds the web app and runs its **7 unit tests** (node, no browser);
5. runs a **read-only live check** against the deployed contract on studionet ([`web/scripts/live-check.mjs`](web/scripts/live-check.mjs)): the code the chain returns hashes to the same sha256 as `contracts/justice_upgrade.py` in your clone, `get_rules()` and `get_ruling()` return the recorded values, and all 18 recorded transactions (13 scripted incl. 4 expected reverts, 5 from the browser run) are `FINALIZED` as recorded. Nothing is signed or sent.

A summary table marks each step PASS or FAIL. The first run downloads the GenVM v0.2.16 release (about 200 MB) once, so a cold machine takes 3 to 5 minutes; later runs take about a minute. Offline? `JU_SKIP_LIVE=1 bash scripts/verify.sh` runs everything except step 5. CI runs the same `scripts/verify.sh` on every push ([`.github/workflows/ci.yml`](.github/workflows/ci.yml)); a cold-clone log is in [`docs/VERIFY_LOG.md`](docs/VERIFY_LOG.md).

| | |
|---|---|
| Contract (GenLayer studionet) | `0x189247716CB87661fDae59aA5fc38eb9df1D9c9c` |
| Explorer | https://explorer-studio.genlayer.com/address/0x189247716CB87661fDae59aA5fc38eb9df1D9c9c |
| Open in GenLayer Studio | https://studio.genlayer.com/?import-contract=0x189247716CB87661fDae59aA5fc38eb9df1D9c9c |
| Live site | https://yoyoblair333-wq.github.io/justiceupgrade-app/ |
| RPC | `https://studio.genlayer.com/api` |
| Live check only | `cd web && npm ci && npm run live-check` (behind an HTTPS proxy: `NODE_USE_ENV_PROXY=1 npm run live-check`) |

## What it is

Two people record a plain-English agreement on-chain, such as a roommates' chore split, a borrowed bike, or who gets credit for which part of a group project. If they later disagree, either one files a dispute and the other may respond. An LLM running inside the GenVM then gives a **bounded ruling**: `PARTY_A`, `PARTY_B`, `SPLIT` or `INSUFFICIENT_EVIDENCE`, with a short reason and a suggested resolution. Each GenLayer validator re-judges the dispute on its own model, and a validator accepts the leader's result only if it reaches the **same ruling**.

The contract holds no funds and moves no value. It is not an escrow, a payment tool, a delivery checker, or a work or credential verifier. It records text and gives a neutral reading of the parties' own agreement.

## The trust problem

Small agreements between people go wrong all the time, and there is nobody neutral to ask. A friend who referees is not neutral, a court is far too heavy, and a single AI chatbot can be prompted, re-rolled until it says what you want, or run by whichever side controls it. JusticeUpgrade puts the agreement, both statements and the ruling on a public ledger that neither side can edit, and makes the ruling a **consensus** result: independent validators, each running its own model, must reach the same bounded ruling before it is recorded. Inputs that try to instruct the arbiter ("ignore previous instructions", fake JSON rulings, role tags) are refused by the contract before any model sees them.

## How to use it (web app, 4 clicks)

1. Open https://yoyoblair333-wq.github.io/justiceupgrade-app/ and wait for the green **Live** badge. The page checks that the deployed code hashes to the same sha256 as `contracts/justice_upgrade.py` on GitHub, and only then enables the **Run the dispute on testnet** button.
2. In **Try it on testnet**, click **Fill in a sample dispute** (or write your own agreement, dispute and response).
3. Tick the two boxes (the text is public on a testnet; you are 18+ and it has no real names or contact details).
4. Click **Run the dispute on testnet**.

Your browser generates two throwaway testnet accounts (A and B, kept in its localStorage), signs all five transactions with [genlayer-js](https://www.npmjs.com/package/genlayer-js): `create_agreement` (A), `accept_agreement` (B), `file_dispute` (A), `respond` (B) and `resolve_dispute` (A). Each step shows its real status as it moves PENDING, ACCEPTED, FINALIZED, with validator votes and a transaction link. When the ruling transaction is final, the page reads the agreement and the ruling back from the contract with `get_agreement` and `get_ruling`. The browser plays both sides only so one visitor can see the full lifecycle; in real use, two people each sign with their own wallet. A ruling takes about one to three minutes.

Below the form, the page shows the live record: the code-hash check, `get_rules()`, the recorded test agreements and rulings, every recorded transaction checked live, and four attacks the contract rolled back.

## Live evidence

- **Browser run** (the web app, driven by Playwright, every transaction signed in the browser): agreement `web-680d13c1656f`, 5 transactions signed by two in-browser burners, all FINALIZED with execution SUCCESS (103 s end to end); ruling `SPLIT` read back with `get_ruling`. Ruling tx `0x476485fee20698571c7600aca53f30d94a30d831351db3f679870bd1ee5ee13e`. Full record: [`docs/live/browser-run.json`](docs/live/browser-run.json).
- **Scripted run** (13 transactions, including 4 attacks that roll back as designed): [`docs/LIVE_EVIDENCE.md`](docs/LIVE_EVIDENCE.md), [`docs/live/studionet-run.json`](docs/live/studionet-run.json), and the [Deployment evidence](#deployment-evidence-studionet-2026-10-31) table below.

## Verification details

`scripts/verify.sh` is the whole check; the README section [Verify in 2 minutes](#verify-in-2-minutes) has the commands. Expected summary (the full log from a fresh clone is in [`docs/VERIFY_LOG.md`](docs/VERIFY_LOG.md)):

```
================ SUMMARY ================
PASS  setup: fresh .venv + pinned requirements
PASS  genvm-lint check (lint + SDK validation)
PASS  genvm-lint schema (ABI)
PASS  contract tests (pytest, direct mode, LLM mocked)     144 passed
PASS  setup: web npm ci
PASS  web build
PASS  web unit tests (node, no network)                     7 passed
PASS  live read-only check (studionet)                      LIVE CHECK: PASS
=========================================
VERIFY: PASS
```

Notes for a cold machine:

- pytest prints a `gltest.config.yaml not found ... using default config` warning and an INFO block naming `localnet`. This is expected: direct-mode tests never contact a network, so no network config is needed.
- The GenVM v0.2.16 release is downloaded once for the linter (`~/.cache/genvm-linter`) and once for the tests (`~/.cache/gltest-direct`). Both are pinned through `GENVM_VERSION`, so every machine checks against the same SDK.
- If `python3` is older than 3.12, `verify.sh` looks for `python3.13`/`python3.12`; or set `PYTHON=/path/to/python3.12`.
- Behind a corporate HTTPS proxy, `verify.sh` sets `NODE_USE_ENV_PROXY=1` when `HTTPS_PROXY` is set (needs Node 22.21+); add `NODE_EXTRA_CA_CERTS=/path/to/ca.pem` if the proxy re-signs TLS.

The same steps one at a time:

```bash
make setup      # .venv + pinned requirements
make lint       # genvm-lint check contracts/justice_upgrade.py
make test       # pytest tests -q          -> 144 passed
make web        # web: npm ci, build, unit tests  -> 7 passed
make live       # read-only live check against the deployed contract
```

Optional web tiers (need Playwright's Chromium: `cd web && npx playwright install --with-deps chromium`): `npm run test:browser` (the built page in Chromium with the network blocked; CI runs it in the `web` job) and `npm run test:live` (the built page reading the real contract). `JU_WEB_WRITE=1 npm run test:live-write` signs one full dispute on studionet from the page.

To deploy your own copy and try it live, follow [`deploy/STUDIO_DEPLOY.md`](deploy/STUDIO_DEPLOY.md). It covers GenLayer Studio step by step and gives copy-paste arguments for a full run.

---

## Deployment evidence (Studionet, 2026-10-31)

Live deployment made by following `deploy/STUDIO_DEPLOY.md` with the exact arguments in the guide, from freshly generated throwaway accounts. Every transaction below is **FINALIZED**. The full record, with validator votes and the raw receipts, is in [`docs/LIVE_EVIDENCE.md`](docs/LIVE_EVIDENCE.md) and [`docs/live/studionet-run.json`](docs/live/studionet-run.json).

| Item | Value |
|---|---|
| Network | Studionet (`https://studio.genlayer.com/api`) |
| Contract address | `0x189247716CB87661fDae59aA5fc38eb9df1D9c9c` |
| Live page | https://yoyoblair333-wq.github.io/justiceupgrade-app/ |
| Deployed code check | `gen_getContractCode` sha256 `44c405df8ea7696795536f9552efc4de314acaf115832300afae2131e3f939b1` = sha256 of `contracts/justice_upgrade.py` (**match**) |
| Deploy transaction | `0xee8119fc675deb8162f3f3d92669442454b483829ee7326c9bde20bd86dad855`: FINALIZED, SUCCESS |
| `create_agreement` tx | `0x89275ba3fb57539f25a8dbf1386b21bdc61091013a231382d7f309b8c8a106a9`: FINALIZED, SUCCESS |
| `accept_agreement` tx | `0xe52fdbd5fbde8603947744fefbb5638538d1ec32485c75294d72ccccbecac240`: FINALIZED, SUCCESS |
| `file_dispute` tx | `0x7ff8f5efbdd6dc4100e78b5650a2c686f372c6bc8a4cccd595f3cbdc55b1b78b`: FINALIZED, SUCCESS |
| `respond` tx | `0x5a8adc5d3c26ac086d7b27dd31c4fe7eea65aa917b99e898cc0c99dfb80b03c8`: FINALIZED, SUCCESS |
| `resolve_dispute` tx (ruling + consensus result) | `0x582c9a22ffba4726e4e5240d9c1aee4bd6fb53281ad71a455f0f047c3ed281d3`: FINALIZED, SUCCESS. Ruling `SPLIT`, `coerced: false`. Consensus `MAJORITY_AGREE`: 3 agree, 2 disagree of 5 validators |
| Rejected injection attempt tx (expected revert) | `0x6c416071a9859ed62942914eb2e98a4a1fad5b2d7273a81b1337ffb5388ebf85`: FINALIZED, execution ERROR, revert `[EXPECTED] statement contains instructions aimed at the arbiter` |
| Other guard reverts | Outsider files a dispute: `0xe375338d89a1b4756ce4822cd330c01f0317c78f66d9e9ee2f6115530c6a0115` (`[EXPECTED] only a party to the agreement may file a dispute`). Early resolve: `0x3f3347db2ae452c6373b684f41b05aa6853754721ca9f9d7be1c04e5c904ece7` (`[EXPECTED] response window is still open; wait for a response or the deadline`). Double resolve: `0x2d6969dd4d5b62ac1aa3568d251c694c22f70d68660ac8cf58a7cd9c1e3a97ca` (`[EXPECTED] cannot resolve: agreement is RESOLVED, expected DISPUTED`). All FINALIZED, execution ERROR |
| `get_ruling("chores-1")` output | `{"status": "RESOLVED", "ruling": "SPLIT", "coerced": false, "reasoning": "The agreed terms contain no illness exception, so both missed nights (Tuesday and Wednesday) trigger the makeup obligation regardless of cause. Ben acknowledges skipping Wednesday and accepts the consequence, but has not offered to cover the Tuesday miss, which also violated the terms.", "resolution": "Ben should take out Ana's trash on the next two scheduled turns (one for Tuesday's missed dishes, one for Wednesday's), and both parties should discuss whether to add a sickness exception to their agreement going forward."}` |
| Demo video | https://yoyoblair333-wq.github.io/justiceupgrade-app/demo/ju-demo.mp4 (54 s; the web app running one full dispute live, `docs/demo/ju-demo.mp4`) |

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

There are 144 direct-mode contract tests in `tests/direct/`, plus 7 web unit tests (`web/test/unit.test.mjs`), 5 offline browser tests (`web/test/browser.test.mjs`) and the read-only live check (`web/scripts/live-check.mjs`). They run in-process against the real GenVM Python SDK with LLM calls mocked by regex. The fixtures `direct_vm`, `direct_deploy`, `direct_alice`, `direct_bob` and `direct_charlie` come from the `genlayer-test` pytest plugin. `tests/direct/conftest.py` adds the deploy fixture, a clock helper and event capture.

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
scripts/verify.sh               one-shot reviewer verification (ends VERIFY: PASS)
deploy/STUDIO_DEPLOY.md         GenLayer Studio deployment + full example run
docs/VERIFY_LOG.md              output of verify.sh from a fresh clone
docs/LIVE_EVIDENCE.md           live Studionet deployment record
docs/live/studionet-run.json    raw JSON of that run
requirements.txt                pinned: genlayer-test 0.29.2, genvm-linter 0.11.0, pytest 9.1.1
Makefile                        setup / test / lint / verify
.github/workflows/ci.yml        CI: runs scripts/verify.sh + the browser web tests
.github/workflows/pages.yml     deploys web/ to GitHub Pages from main
web/                            live web app: run a dispute from the browser + the live record
                                (npm ci && npm run build && npm run test:unit; npm run live-check
                                reads the real contract without a browser; npm run test:browser
                                and npm run test:live need Chromium; JU_WEB_WRITE=1
                                npm run test:live-write signs one full dispute on studionet)
web/scripts/live-check.mjs      read-only live check used by verify.sh (step 8)
docs/live/browser-run.json      a full dispute signed in the browser by the web app
docs/demo/ju-demo.mp4           54 s demo video (+ .srt captions), served at demo/ on Pages
```

## SDK target and known caveats

- The contract targets the GenVM **v0.2** Python SDK (runner hash `py-genlayer:1jb45aa8…` in the file header, the same one the official `genlayer-project-boilerplate` uses). It was validated with `genvm-linter` 0.11.0 against GenVM v0.2.16. If the network you deploy to has moved to SDK v0.3, the import and storage names change; check before deploying.
- The response window uses the transaction datetime (`gl.message_raw["datetime"]`). Its format is handled for `…Z` and `±HH:MM` ISO strings. Confirmed live on Studionet, which supplies `…Z` timestamps (see `docs/LIVE_EVIDENCE.md`).
- Rulings come from LLMs and are advisory. Different validator models can disagree on close cases. When that happens the transaction does not reach consensus, which is the intended fail-closed behaviour.

## Lineage

JusticeUpgrade has the same author as **VERDICT**. JusticeUpgrade is the developer primitive: a small, reusable contract for disputes over a written agreement between two parties. VERDICT is the consumer entertainment app (light-hearted "who's right?" contests). The two are separate codebases.

## License

MIT, see [`LICENSE`](LICENSE).

#JusticeNeedsAnUpgrade
