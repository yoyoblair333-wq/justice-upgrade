# Live evidence: studionet

One live deployment of `contracts/justice_upgrade.py` to GenLayer Studionet, followed by the full lifecycle and four expected-revert guard demonstrations from [`deploy/STUDIO_DEPLOY.md`](../deploy/STUDIO_DEPLOY.md). The run was scripted with `genlayer-js` 1.1.8, using the exact arguments in the guide. Every write was sent from one of three freshly generated throwaway accounts that hold no value. All examples are fictional (roommates' chores, a group-project credit split).

The full raw record, including the complete `getTransaction` leader receipts, is in [`docs/live/studionet-run.json`](live/studionet-run.json). A trimmed copy is at the end of this page.

## Summary

| Item | Value |
|---|---|
| Network / RPC | Studionet, `https://studio.genlayer.com/api` |
| Contract address | `0x189247716CB87661fDae59aA5fc38eb9df1D9c9c` |
| Deploy tx | `0xee8119fc675deb8162f3f3d92669442454b483829ee7326c9bde20bd86dad855`: FINALIZED, execution SUCCESS |
| Code pin | `gen_getContractCode` returned 22807 bytes, sha256 `44c405df8ea7696795536f9552efc4de314acaf115832300afae2131e3f939b1`; sha256 of `contracts/justice_upgrade.py` is `44c405df8ea7696795536f9552efc4de314acaf115832300afae2131e3f939b1` (**match**) |
| Accounts (throwaway) | Ana / PARTY_A and deployer `0x2A335F4FbbE1a367D46BdC01cD751a5C315F964b`; Ben / PARTY_B `0xF6B5A180aDCc9d0C379343cb0c1009A83188c3A3`; outsider `0xebA49Cd84C873561c55f267320b1e4Ad6B67F322` |
| Run window | 2026-10-31T22:05:07.612Z to 2026-10-31T22:07:52.444Z |
| Result | 13 transactions, all FINALIZED. 9 executed with SUCCESS; the 4 guard demonstrations reverted with exactly the expected `[EXPECTED]` messages. |

## The ruling (`get_ruling("chores-1")` after `resolve_dispute`)

```json
{
  "coerced": false,
  "reasoning": "The agreed terms contain no illness exception, so both missed nights (Tuesday and Wednesday) trigger the makeup obligation regardless of cause. Ben acknowledges skipping Wednesday and accepts the consequence, but has not offered to cover the Tuesday miss, which also violated the terms.",
  "resolution": "Ben should take out Ana's trash on the next two scheduled turns (one for Tuesday's missed dishes, one for Wednesday's), and both parties should discuss whether to add a sickness exception to their agreement going forward.",
  "ruling": "SPLIT",
  "status": "RESOLVED"
}
```

The `resolve_dispute` transaction reached consensus with **3 agree, 2 disagree** out of 5 validators (`MAJORITY_AGREE`, rotation count 0). Each validator re-ran the prompt on its own model and agreed only if its ruling matched the leader's `SPLIT`. Two validators reached a different ruling and voted disagree, which the majority outvoted. This is the bounded-ruling consensus working on a live network: the reasoning text was free to differ, the ruling was not.

## Live checks of the README caveats

- **Transaction datetime format.** Studionet supplied `…Z` ISO timestamps (for example `filed_at` `2026-10-31T22:05:31Z`) and `response_deadline` came out exactly one hour later (`2026-10-31T23:05:31Z`) for `response_window_hours = 1`. `_parse_time` handled them with no change.
- **SDK target.** The contract deployed and ran with its `py-genlayer:1jb45aa8…` (GenVM v0.2) header unchanged.
- **Views.** `get_rules` returned the expected rule set (`holds_funds: false`). `get_agreement_count` returned 2 after the run, and `get_status("project-1")` stayed `DISPUTED` after the blocked early resolve.

## Every transaction

Status is the final state from `getTransaction` (chain status / consensus result / leader execution result). Votes are the final `consensus_data.votes`. A revert is a FINALIZED transaction whose leader execution is `ERROR` with the contract's `rollback` message; nothing was written.

| # | Call | Step | Sender | Tx hash | Final status | Validator votes | Revert reason |
|---|---|---|---|---|---|---|---|
| 1 | `deploy (constructor, no args)` | deploy | ana | `0xee8119fc675deb8162f3f3d92669442454b483829ee7326c9bde20bd86dad855` | FINALIZED / MAJORITY_AGREE / SUCCESS | agree 4, idle 1 |  |
| 2 | `create_agreement` | 4.1 create_agreement | ana | `0x89275ba3fb57539f25a8dbf1386b21bdc61091013a231382d7f309b8c8a106a9` | FINALIZED / MAJORITY_AGREE / SUCCESS | agree 3, idle 2 |  |
| 3 | `accept_agreement` | 4.2 accept_agreement | ben | `0xe52fdbd5fbde8603947744fefbb5638538d1ec32485c75294d72ccccbecac240` | FINALIZED / MAJORITY_AGREE / SUCCESS | agree 5 |  |
| 4 | `file_dispute` | 4.3 file_dispute | ana | `0x7ff8f5efbdd6dc4100e78b5650a2c686f372c6bc8a4cccd595f3cbdc55b1b78b` | FINALIZED / MAJORITY_AGREE / SUCCESS | agree 4, idle 1 |  |
| 5 | `respond` | 4.4 respond | ben | `0x5a8adc5d3c26ac086d7b27dd31c4fe7eea65aa917b99e898cc0c99dfb80b03c8` | FINALIZED / MAJORITY_AGREE / SUCCESS | agree 3, idle 2 |  |
| 6 | `resolve_dispute` | 4.5 resolve_dispute | ana | `0x582c9a22ffba4726e4e5240d9c1aee4bd6fb53281ad71a455f0f047c3ed281d3` | FINALIZED / MAJORITY_AGREE / SUCCESS | agree 3, disagree 2 |  |
| 7 | `create_agreement` | 5.1 create_agreement project-1 | ana | `0xbd617b6e3627499962df04b2da4dfcd0db3c94cd1e9fa6af2083a9e6225dfa23` | FINALIZED / MAJORITY_AGREE / SUCCESS | agree 3, idle 2 |  |
| 8 | `accept_agreement` | 5.2 accept_agreement project-1 | ben | `0x56d8be7b1b6d53b139cd4fecbf603efbb3c0022e472fdf883fe2f0b3ad475967` | FINALIZED / MAJORITY_AGREE / SUCCESS | agree 3, idle 2 |  |
| 9 | `file_dispute` | 5.3 injection rejected | ben | `0x6c416071a9859ed62942914eb2e98a4a1fad5b2d7273a81b1337ffb5388ebf85` | FINALIZED / MAJORITY_AGREE / ERROR | agree 3, idle 2 | `[EXPECTED] statement contains instructions aimed at the arbiter` |
| 10 | `file_dispute` | 5.4 outsider rejected | outsider | `0xe375338d89a1b4756ce4822cd330c01f0317c78f66d9e9ee2f6115530c6a0115` | FINALIZED / MAJORITY_AGREE / ERROR | agree 3, idle 2 | `[EXPECTED] only a party to the agreement may file a dispute` |
| 11 | `file_dispute` | 5.5a file_dispute project-1 | ben | `0x36e843a64ae020d3f55eed904948aba1ad56acffdaf7407c6e1642ee28482d73` | FINALIZED / MAJORITY_AGREE / SUCCESS | agree 3, idle 2 |  |
| 12 | `resolve_dispute` | 5.5b early resolve blocked | ana | `0x3f3347db2ae452c6373b684f41b05aa6853754721ca9f9d7be1c04e5c904ece7` | FINALIZED / MAJORITY_AGREE / ERROR | agree 3, idle 2 | `[EXPECTED] response window is still open; wait for a response or the deadline` |
| 13 | `resolve_dispute` | 5.6 double resolve blocked | ana | `0x2d6969dd4d5b62ac1aa3568d251c694c22f70d68660ac8cf58a7cd9c1e3a97ca` | FINALIZED / MAJORITY_AGREE / ERROR | agree 4, idle 1 | `[EXPECTED] cannot resolve: agreement is RESOLVED, expected DISPUTED` |

## Raw JSON record (trimmed)

Base64 receipt blobs are omitted here; they are in `docs/live/studionet-run.json`.

```json
{
  "network": "studionet",
  "rpc": "https://studio.genlayer.com/api",
  "client": "genlayer-js 1.1.8",
  "startedAt": "2026-10-31T22:05:07.612Z",
  "finishedAt": "2026-10-31T22:07:52.444Z",
  "contractAddress": "0x189247716CB87661fDae59aA5fc38eb9df1D9c9c",
  "deployTx": "0xee8119fc675deb8162f3f3d92669442454b483829ee7326c9bde20bd86dad855",
  "accounts": {
    "ana": "0x2A335F4FbbE1a367D46BdC01cD751a5C315F964b",
    "ben": "0xF6B5A180aDCc9d0C379343cb0c1009A83188c3A3",
    "outsider": "0xebA49Cd84C873561c55f267320b1e4Ad6B67F322"
  },
  "codePin": {
    "method": "gen_getContractCode",
    "onchainSha256": "44c405df8ea7696795536f9552efc4de314acaf115832300afae2131e3f939b1",
    "sourceSha256": "44c405df8ea7696795536f9552efc4de314acaf115832300afae2131e3f939b1",
    "match": true,
    "bytes": 22807
  },
  "get_rules": {
    "holds_funds": false,
    "max_statement_chars": 1500,
    "max_terms_chars": 2000,
    "max_window_hours": 720,
    "min_window_hours": 1,
    "rulings": [
      "PARTY_A",
      "PARTY_B",
      "SPLIT",
      "INSUFFICIENT_EVIDENCE"
    ],
    "statuses": [
      "PROPOSED",
      "ACTIVE",
      "DISPUTED",
      "RESOLVED",
      "CANCELLED"
    ]
  },
  "get_ruling_chores_1": {
    "coerced": false,
    "reasoning": "The agreed terms contain no illness exception, so both missed nights (Tuesday and Wednesday) trigger the makeup obligation regardless of cause. Ben acknowledges skipping Wednesday and accepts the consequence, but has not offered to cover the Tuesday miss, which also violated the terms.",
    "resolution": "Ben should take out Ana's trash on the next two scheduled turns (one for Tuesday's missed dishes, one for Wednesday's), and both parties should discuss whether to add a sickness exception to their agreement going forward.",
    "ruling": "SPLIT",
    "status": "RESOLVED"
  },
  "transactions": [
    {
      "label": "deploy",
      "call": "deploy (constructor, no args)",
      "sender": "ana",
      "hash": "0xee8119fc675deb8162f3f3d92669442454b483829ee7326c9bde20bd86dad855",
      "status": "FINALIZED",
      "result": "MAJORITY_AGREE",
      "execution": "SUCCESS",
      "votes": {
        "agree": 4,
        "idle": 1
      },
      "validators": 5,
      "rotation_count": 0
    },
    {
      "label": "4.1 create_agreement",
      "call": "create_agreement",
      "sender": "ana",
      "hash": "0x89275ba3fb57539f25a8dbf1386b21bdc61091013a231382d7f309b8c8a106a9",
      "status": "FINALIZED",
      "result": "MAJORITY_AGREE",
      "execution": "SUCCESS",
      "votes": {
        "agree": 3,
        "idle": 2
      },
      "validators": 5,
      "rotation_count": 0,
      "expected": "SUCCESS"
    },
    {
      "label": "4.2 accept_agreement",
      "call": "accept_agreement",
      "sender": "ben",
      "hash": "0xe52fdbd5fbde8603947744fefbb5638538d1ec32485c75294d72ccccbecac240",
      "status": "FINALIZED",
      "result": "MAJORITY_AGREE",
      "execution": "SUCCESS",
      "votes": {
        "agree": 5
      },
      "validators": 5,
      "rotation_count": 0,
      "expected": "SUCCESS"
    },
    {
      "label": "4.3 file_dispute",
      "call": "file_dispute",
      "sender": "ana",
      "hash": "0x7ff8f5efbdd6dc4100e78b5650a2c686f372c6bc8a4cccd595f3cbdc55b1b78b",
      "status": "FINALIZED",
      "result": "MAJORITY_AGREE",
      "execution": "SUCCESS",
      "votes": {
        "agree": 4,
        "idle": 1
      },
      "validators": 5,
      "rotation_count": 0,
      "expected": "SUCCESS"
    },
    {
      "label": "4.4 respond",
      "call": "respond",
      "sender": "ben",
      "hash": "0x5a8adc5d3c26ac086d7b27dd31c4fe7eea65aa917b99e898cc0c99dfb80b03c8",
      "status": "FINALIZED",
      "result": "MAJORITY_AGREE",
      "execution": "SUCCESS",
      "votes": {
        "agree": 3,
        "idle": 2
      },
      "validators": 5,
      "rotation_count": 0,
      "expected": "SUCCESS"
    },
    {
      "label": "4.5 resolve_dispute",
      "call": "resolve_dispute",
      "sender": "ana",
      "hash": "0x582c9a22ffba4726e4e5240d9c1aee4bd6fb53281ad71a455f0f047c3ed281d3",
      "status": "FINALIZED",
      "result": "MAJORITY_AGREE",
      "execution": "SUCCESS",
      "votes": {
        "agree": 3,
        "disagree": 2
      },
      "validators": 5,
      "rotation_count": 0,
      "expected": "SUCCESS"
    },
    {
      "label": "5.1 create_agreement project-1",
      "call": "create_agreement",
      "sender": "ana",
      "hash": "0xbd617b6e3627499962df04b2da4dfcd0db3c94cd1e9fa6af2083a9e6225dfa23",
      "status": "FINALIZED",
      "result": "MAJORITY_AGREE",
      "execution": "SUCCESS",
      "votes": {
        "agree": 3,
        "idle": 2
      },
      "validators": 5,
      "rotation_count": 0,
      "expected": "SUCCESS"
    },
    {
      "label": "5.2 accept_agreement project-1",
      "call": "accept_agreement",
      "sender": "ben",
      "hash": "0x56d8be7b1b6d53b139cd4fecbf603efbb3c0022e472fdf883fe2f0b3ad475967",
      "status": "FINALIZED",
      "result": "MAJORITY_AGREE",
      "execution": "SUCCESS",
      "votes": {
        "agree": 3,
        "idle": 2
      },
      "validators": 5,
      "rotation_count": 0,
      "expected": "SUCCESS"
    },
    {
      "label": "5.3 injection rejected",
      "call": "file_dispute",
      "sender": "ben",
      "hash": "0x6c416071a9859ed62942914eb2e98a4a1fad5b2d7273a81b1337ffb5388ebf85",
      "status": "FINALIZED",
      "result": "MAJORITY_AGREE",
      "execution": "ERROR",
      "votes": {
        "agree": 3,
        "idle": 2
      },
      "validators": 5,
      "rotation_count": 0,
      "revert_reason": "[EXPECTED] statement contains instructions aimed at the arbiter",
      "expected": "[EXPECTED] statement contains instructions aimed at the arbiter"
    },
    {
      "label": "5.4 outsider rejected",
      "call": "file_dispute",
      "sender": "outsider",
      "hash": "0xe375338d89a1b4756ce4822cd330c01f0317c78f66d9e9ee2f6115530c6a0115",
      "status": "FINALIZED",
      "result": "MAJORITY_AGREE",
      "execution": "ERROR",
      "votes": {
        "agree": 3,
        "idle": 2
      },
      "validators": 5,
      "rotation_count": 0,
      "revert_reason": "[EXPECTED] only a party to the agreement may file a dispute",
      "expected": "[EXPECTED] only a party to the agreement may file a dispute"
    },
    {
      "label": "5.5a file_dispute project-1",
      "call": "file_dispute",
      "sender": "ben",
      "hash": "0x36e843a64ae020d3f55eed904948aba1ad56acffdaf7407c6e1642ee28482d73",
      "status": "FINALIZED",
      "result": "MAJORITY_AGREE",
      "execution": "SUCCESS",
      "votes": {
        "agree": 3,
        "idle": 2
      },
      "validators": 5,
      "rotation_count": 0,
      "expected": "SUCCESS"
    },
    {
      "label": "5.5b early resolve blocked",
      "call": "resolve_dispute",
      "sender": "ana",
      "hash": "0x3f3347db2ae452c6373b684f41b05aa6853754721ca9f9d7be1c04e5c904ece7",
      "status": "FINALIZED",
      "result": "MAJORITY_AGREE",
      "execution": "ERROR",
      "votes": {
        "agree": 3,
        "idle": 2
      },
      "validators": 5,
      "rotation_count": 0,
      "revert_reason": "[EXPECTED] response window is still open; wait for a response or the deadline",
      "expected": "[EXPECTED] response window is still open; wait for a response or the deadline"
    },
    {
      "label": "5.6 double resolve blocked",
      "call": "resolve_dispute",
      "sender": "ana",
      "hash": "0x2d6969dd4d5b62ac1aa3568d251c694c22f70d68660ac8cf58a7cd9c1e3a97ca",
      "status": "FINALIZED",
      "result": "MAJORITY_AGREE",
      "execution": "ERROR",
      "votes": {
        "agree": 4,
        "idle": 1
      },
      "validators": 5,
      "rotation_count": 0,
      "revert_reason": "[EXPECTED] cannot resolve: agreement is RESOLVED, expected DISPUTED",
      "expected": "[EXPECTED] cannot resolve: agreement is RESOLVED, expected DISPUTED"
    }
  ]
}
```
