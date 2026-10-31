# verify.sh log from a fresh clone

This log records `scripts/verify.sh` run on a fresh `git clone` of this repository (commit `522197a`). It ran in an empty scratch directory with an **empty `HOME`**: no pip cache, no GenVM cache and no pre-installed tools in the venv. Everything was downloaded from scratch.

- Date: 2026-10-31
- Host: Linux x86_64, Python 3.13.18
- Command: `git clone <repo> repo && cd repo && bash scripts/verify.sh`
- Result: **exit code 0, `VERIFY: PASS`, 144 passed**
- Wall time: about 4 minutes. Most of it is two one-time downloads of the GenVM v0.2.16 release, about 207 MB each: one into `~/.cache/genvm-linter` and one into `~/.cache/gltest-direct`.

The repeated `Downloading: N/206.6 MB` progress lines are collapsed below. Nothing else was edited.

The `gltest.config.yaml not found` WARNING and the INFO block that follows it come from the genlayer-test pytest plugin. They are expected: direct-mode tests never contact a network.

```
== JusticeUpgrade verify ==
python 3.13.18 OK
GenVM SDK release: v0.2.16
== 1/4 create fresh virtualenv (.venv) ==
genlayer-py==0.16.3
genlayer-test==0.29.2
genvm-linter==0.11.0
pytest==9.1.1
== 2/4 genvm-lint check (lint + SDK validation) ==
[GenVM v0.2.16 download progress: 0% -> 100%, 206.6 MB]
✓ Lint passed (3 checks)
✓ Validation passed
  Contract: JusticeUpgrade
  Methods: 12 (6 view, 6 write)
== 3/4 ABI schema ==
schema extracted OK
== 4/4 direct-mode tests (real GenVM SDK, LLM mocked) ==
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
144 passed in 57.98s
VERIFY: PASS

real	4m4.142s
user	2m16.880s
sys	0m4.483s
```
