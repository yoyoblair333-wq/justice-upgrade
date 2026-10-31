# JusticeUpgrade — an on-chain AI arbiter primitive for GenLayer

**What it is:** a small, reusable GenLayer Intelligent Contract that lets two
parties record a plain-language agreement on-chain and have an on-chain LLM
render an impartial, reasoned verdict if they later disagree.

**Why it needs GenLayer:** an ordinary smart contract can only execute
deterministic code — it cannot read a paragraph of terms, understand a
complaint, and judge fairness. GenLayer's GenVM can, because Intelligent
Contracts reach an LLM through an *equivalence principle* that forces every
validator to agree on the result before it is written to chain.

## The primitive: consensus on a subjective AI judgment

The interesting part isn't "an AI decides" — it's **how validators agree** on a
subjective judgment without a single trusted oracle. The pattern here:

1. **Bound the output.** The arbiter must return one of four rulings —
   `PARTY_A`, `PARTY_B`, `SPLIT`, `INSUFFICIENT_EVIDENCE`. Any out-of-set answer
   is coerced to the safe default. A small categorical output is what makes
   consensus on a fuzzy judgment tractable.
2. **Judge independently, agree on the category.** Using
   `glvm.run_nondet_unsafe(leader_fn, validator_fn)`, the leader produces a
   verdict and **each validator re-judges the same dispute and accepts only if
   it reaches the same bounded ruling.** The free-text reasoning may differ
   between nodes; the *decision* must match. That is real consensus logic, not a
   format check.

Any builder can reuse this shape — bounded categorical output + independent
re-judgment — for other subjective on-chain decisions (claims triage, content
rulings, grant acceptance, eligibility calls).

## Contract API

| Method | Kind | Purpose |
|---|---|---|
| `create_agreement(agreement_id, party_b, terms)` | write | Caller (PARTY_A) records terms with a counterparty. |
| `file_dispute(agreement_id, statement)` | write | Either party files a complaint; status → `disputed`. |
| `resolve_dispute(agreement_id)` | write | On-chain LLM rules; stores ruling, reasoning, resolution. |
| `get_agreement(agreement_id)` | view | Full agreement + verdict. |
| `get_ruling(agreement_id)` | view | Just the verdict. |

Access control: only `party_a` or `party_b` may dispute or request a ruling; a
resolved agreement is final.

## Example flow

```python
# PARTY_A records the deal
create_agreement("deal-1", "0xBob...", "Bob pays Alice 100 for a logo as an SVG by Friday.")
# PARTY_B complains
file_dispute("deal-1", "Alice delivered a PNG, not an SVG, and it was late.")
# The chain judges it
resolve_dispute("deal-1")
# -> {"ruling": "PARTY_B", "reasoning": "...", "resolution": "Redeliver an SVG or refund 50."}
```

## Tests

`test_justice_upgrade.py` runs in GenLayer **direct mode** (in-memory, LLM
mocked) and covers: the full dispute→ruling flow, access control (a stranger
can't dispute), guarding resolution before a dispute exists, and coercion of an
out-of-set ruling to the safe default.

```bash
pytest tests/direct/test_justice_upgrade.py -v
```

## Files

- `justice_upgrade.py` — the Intelligent Contract
- `test_justice_upgrade.py` — direct-mode tests

Built on GenLayer's verified SDK patterns (`gl.Contract`, `TreeMap`,
`@allow_storage` dataclasses, `gl.nondet.exec_prompt`, `glvm.run_nondet_unsafe`).

#JusticeNeedsAnUpgrade
