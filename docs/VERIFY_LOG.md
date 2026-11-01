# verify.sh log from a fresh clone

This is `scripts/verify.sh` run on a fresh `git clone` from GitHub (commit `fc3acdf`), in an empty scratch directory with an **empty `HOME`**: no pip cache, no npm cache, no GenVM cache. Everything was downloaded from scratch.

- Date: 2026-11-01
- Host: Linux x86_64, Python 3.13.18, Node v22.23.4, npm 10.9.9
- Command: `git clone https://github.com/yoyoblair333-wq/justiceupgrade-app.git && cd justiceupgrade-app && bash scripts/verify.sh`
- Result: **exit code 0, `VERIFY: PASS`**: 144 contract tests passed, 7 web unit tests passed, `LIVE CHECK: PASS` (7 of 7 live checks against `0x189247716CB87661fDae59aA5fc38eb9df1D9c9c` on studionet)
- Wall time: 175 s. Most of it is the one-time GenVM v0.2.16 release download (about 207 MB) in step 2 and the first direct-mode test run in step 4; a second run takes about a minute.

This is the script's complete output, unedited except that the scratch `HOME` path is shown as `~`. (`verify.sh` itself hides the `Downloading: N/206.6 MB` progress lines of the GenVM release download.) The `gltest.config.yaml not found` WARNING and the INFO block after it come from the genlayer-test pytest plugin and are expected: direct-mode tests never contact a network.

CI runs the same script on every push: https://github.com/yoyoblair333-wq/justiceupgrade-app/actions/workflows/ci.yml

```
== JusticeUpgrade verify: 2026-11-01T21:12:44Z ==
python: Python 3.13.18 (python3.13)   node: v22.23.4   npm: 10.9.9   GenVM SDK: v0.2.16

==> 1. setup: fresh .venv + pinned requirements
    $ bash -c rm -rf .venv && 'python3.13' -m venv .venv && .venv/bin/python -m pip install --quiet --upgrade pip && .venv/bin/python -m pip install --quiet -r requirements.txt && .venv/bin/python -m pip freeze | grep -iE '^(genlayer-test|genvm-linter|pytest|genlayer-py)=='
genlayer-py==0.16.3
genlayer-test==0.29.2
genvm-linter==0.11.0
pytest==9.1.1

==> 2. genvm-lint check (lint + SDK validation)
    $ .venv/bin/genvm-lint check contracts/justice_upgrade.py
✓ Lint passed (3 checks)
✓ Validation passed
  Contract: JusticeUpgrade
  Methods: 12 (6 view, 6 write)

==> 3. genvm-lint schema (ABI)
    $ .venv/bin/genvm-lint schema contracts/justice_upgrade.py
Contract: JusticeUpgrade
Constructor (0 params):
Methods (12):
  - accept_agreement(agreement_id) [write]
  - cancel_agreement(agreement_id) [write]
  - create_agreement(agreement_id, party_b, terms, response_window_hours) [write]
  - file_dispute(agreement_id, statement) [write]
  - get_agreement(agreement_id) [view]
  - get_agreement_count() [view]
  - get_rules() [view]
  - get_ruling(agreement_id) [view]
  - get_status(agreement_id) [view]
  - list_agreement_ids(offset, limit) [view]
  - resolve_dispute(agreement_id) [write]
  - respond(agreement_id, statement) [write]

==> 4. contract tests (pytest, direct mode, LLM mocked)
    $ .venv/bin/python -m pytest tests -q -p no:cacheprovider
WARNING: File `gltest.config.yaml` not found in the current directory, using default config, create a `gltest.config.yaml` file to manage multiple networks
INFO: Using the following configuration:
INFO:   RPC URL: http://127.0.0.1:4000/api
INFO:   Selected Network: localnet
INFO:   Available networks: ['localnet', 'studionet', 'testnet_asimov', 'testnet_bradbury']
INFO:   Selected chain type: localnet
INFO:   Available chains: localnet, studionet, testnet_asimov, testnet_bradbury
INFO:   Contracts directory: contracts
INFO:   Artifacts directory: artifacts
INFO:   Environment: .env
INFO:   Default wait interval: 3000 ms
INFO:   Default wait retries: 50
INFO:   Leader only mode: False
........................................................................ [ 50%]
........................................................................ [100%]
144 passed in 55.66s

==> 5. setup: web npm ci
    $ bash -c cd web && npm ci --no-audit --no-fund --loglevel=error
added 224 packages in 6s

==> 6. web build
    $ bash -c cd web && npm run --silent build
  dist/app.js            576.8kb
  dist/app.js.LEGAL.txt    429b 
  dist/app.js.map          3.2mb
⚡ Done in 304ms
evidence.json: 13 txs (4 expected reverts), agreements ["chores-1","project-1"]
snapshot.json: taken 2026-10-31T23:29:06.480Z

==> 7. web unit tests (node, no network)
    $ bash -c cd web && node --test --test-reporter=spec test/unit.test.mjs
✔ evidence index: 13 recorded txs, 4 expected reverts with titles, 2 agreements, fictional names (2.515189ms)
✔ revert reason: decoded payload, or raw bytes after the tag; none on success (0.309827ms)
✔ tx summary and vote counts (0.599812ms)
✔ committed fallback snapshot: this contract, dated, code pin match, every recorded tx and revert reason (0.458668ms)
✔ page code never parses strings as HTML (1.417166ms)
✔ input guards mirror the contract: same 16 control patterns in the same order (33.634661ms)
✔ input guards: refuse what the contract refuses, pass ordinary speech (4.738872ms)
ℹ tests 7
ℹ suites 0
ℹ pass 7
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 159.455869

==> 8. live read-only check (studionet)
    $ bash -c cd web && node --no-warnings scripts/live-check.mjs
JusticeUpgrade live check (read-only)
  rpc:      https://studio.genlayer.com/api
  contract: 0x189247716CB87661fDae59aA5fc38eb9df1D9c9c
  explorer: https://explorer-studio.genlayer.com/address/0x189247716CB87661fDae59aA5fc38eb9df1D9c9c
  source:   contracts/justice_upgrade.py sha256 44c405df8ea7696795536f9552efc4de314acaf115832300afae2131e3f939b1
PASS  deployed code sha256 = sha256 of contracts/justice_upgrade.py: 44c405df8ea7696795536f9552efc4de314acaf115832300afae2131e3f939b1 (22807 bytes)
PASS  get_rules(): rulings PARTY_A/PARTY_B/SPLIT/INSUFFICIENT_EVIDENCE, holds_funds false: rulings ["PARTY_A","PARTY_B","SPLIT","INSUFFICIENT_EVIDENCE"], holds_funds false
PASS  get_agreement_count() >= 2: 7
PASS  get_ruling("chores-1") = RESOLVED / SPLIT: RESOLVED / SPLIT, coerced false
PASS  recorded studionet run: 13/13 txs FINALIZED as recorded (incl. 4 expected reverts)
PASS  get_ruling("web-680d13c1656f") (browser run) = RESOLVED / SPLIT: RESOLVED / SPLIT
PASS  browser run: 5/5 txs FINALIZED with SUCCESS
LIVE CHECK: PASS

================ SUMMARY ================
PASS  setup: fresh .venv + pinned requirements (19s)
PASS  genvm-lint check (lint + SDK validation) (82s)
PASS  genvm-lint schema (ABI) (0s)
PASS  contract tests (pytest, direct mode, LLM mocked) (59s)
PASS  setup: web npm ci (6s)
PASS  web build (1s)
PASS  web unit tests (node, no network) (0s)
PASS  live read-only check (studionet) (8s)
=========================================
VERIFY: PASS
```
