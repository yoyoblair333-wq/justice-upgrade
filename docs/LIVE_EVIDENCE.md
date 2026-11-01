# Live evidence: studionet

One live deployment of `contracts/justice_upgrade.py` to GenLayer Studionet, followed by the full lifecycle and four expected-revert guard demonstrations from [`deploy/STUDIO_DEPLOY.md`](../deploy/STUDIO_DEPLOY.md). The run was scripted with `genlayer-js` 1.1.8, using the exact arguments in the guide. Every write was sent from one of three freshly generated throwaway accounts that hold no value. All examples are fictional (roommates' chores, a group-project credit split).

The full raw record, including the complete `getTransaction` leader receipts, is in [`docs/live/studionet-run.json`](live/studionet-run.json). A trimmed copy is at the end of this page.

## Browser run: one full dispute signed in the web app (2026-11-01)

The web app's **Try it on testnet** flow, run on the built site (`web/dist`) by Playwright through `JU_WEB_WRITE=1 npm run test:live-write`. The browser generated two testnet burners (A `0x44a7B014113253CA4a1A4875F69165C443f975b1`, B `0xcCcB14AA0593e2a8caA5C85E5a1AC8d7E15EA2b3`) and signed all five transactions itself with genlayer-js; nothing was mocked. Each step was followed to FINALIZED, and the ruling was read back from the contract with `get_agreement` / `get_ruling`. Agreement `web-680d13c1656f`, sample "Chore swap", 103 s from page load to the last FINALIZED. Raw record: [`docs/live/browser-run.json`](live/browser-run.json).

| # | Call | Signer | Tx | Final status / execution | Validator votes |
|---|---|---|---|---|---|
| 1 | `create_agreement` | A | `0xe0e4ad3c34f03aee4089fab729a51f9fe3c069c1622fe47b5fa93cb45f95a771` | FINALIZED / SUCCESS | agree 3, idle 2 |
| 2 | `accept_agreement` | B | `0xb479f10592491447aae05745b3d90ee21b0ffb767ede87e2f6071b491461fe08` | FINALIZED / SUCCESS | agree 4, idle 1 |
| 3 | `file_dispute` | A | `0x18ae7e58c09d8fc55aa7d56a1256e0d94fa31fa2590755c312a831745c566ead` | FINALIZED / SUCCESS | agree 3, idle 2 |
| 4 | `respond` | B | `0x46087cb63919466523a3c3a3a8e5d2e3f34b2015ef90fd70e06a15d998925cd9` | FINALIZED / SUCCESS | agree 3, idle 2 |
| 5 | `resolve_dispute` | A | `0x476485fee20698571c7600aca53f30d94a30d831351db3f679870bd1ee5ee13e` | FINALIZED / SUCCESS | agree 3, idle 2 |

Ruling read back: **SPLIT**, `coerced: false`.

> Under the agreed terms, a swap requires texting before 6pm, which B claims to have done on Tuesday — making the Tuesday skip potentially valid if the swap offer was accepted or at least properly communicated; however, B admits to fully failing the Wednesday obligation without any prior text, which is a clear breach of the terms. Party A's grievance is therefore partially valid (Wednesday) but not fully valid if B's Tuesday text is accurate.

Resolution: B should complete two extra dish nights this week to cover the Wednesday breach as already offered; the parties should clarify and confirm whether the Tuesday text swap was received and agreed upon, and going forward both parties should explicitly confirm swap requests to avoid ambiguity.

The demo video ([`docs/demo/ju-demo.mp4`](demo/ju-demo.mp4)) records a second run of the same flow: agreement `web-9ecc7e5783e0`, ruling **SPLIT**, all five transactions FINALIZED with execution SUCCESS (ruling tx `0xf5321733a14775e57e20b4f0c6a81d5fa7b947a34fb6f8eb29b6c6f8e0164739`). Record: [`docs/live/browser-run-demo-video.json`](live/browser-run-demo-video.json).

## Scripted run: summary

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
