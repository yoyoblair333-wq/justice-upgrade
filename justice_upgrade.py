# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }
"""
JusticeUpgrade — an on-chain AI arbiter Intelligent Contract for GenLayer.

Two parties record a plain-language agreement on-chain. If something goes wrong,
either party files a dispute describing what happened. The contract then calls a
large language model *inside the GenVM* to weigh the dispute against the agreed
terms and return an impartial, reasoned verdict — a recommended resolution plus
the reasoning behind it.

A normal blockchain can only run deterministic code: it cannot read a paragraph of
terms, understand a complaint, and judge fairness. GenLayer can, because its
Intelligent Contracts reach LLMs through the equivalence principle so every
validator agrees on a result. This contract is a minimal, reusable template for
that pattern — agreements, evidence, and an AI judgment, all on-chain.

#JusticeNeedsAnUpgrade
"""

import json
from dataclasses import dataclass

from genlayer import *
import genlayer.gl.vm as glvm


# The four rulings the arbiter is allowed to return. Keeping this a closed set
# lets validators agree on structure even when the free-text reasoning differs.
ALLOWED_RULINGS = ("PARTY_A", "PARTY_B", "SPLIT", "INSUFFICIENT_EVIDENCE")


@allow_storage
@dataclass
class Agreement:
    id: str
    party_a: str          # address that created the agreement (hex string)
    party_b: str          # the counterparty (hex string)
    terms: str            # plain-language terms both sides agreed to
    status: str           # "active" | "disputed" | "resolved"
    dispute: str          # the complaint filed by one of the parties
    filed_by: str         # address that filed the dispute (hex string)
    ruling: str           # one of ALLOWED_RULINGS, or "" if unresolved
    reasoning: str        # the arbiter's explanation
    resolution: str       # the arbiter's recommended remedy


class JusticeUpgrade(gl.Contract):
    agreements: TreeMap[str, Agreement]

    def __init__(self) -> None:
        self.agreements = TreeMap()

    # ── Write: create a new agreement ───────────────────────────────────────
    @gl.public.write
    def create_agreement(self, agreement_id: str, party_b: str, terms: str) -> None:
        if agreement_id in self.agreements:
            raise Exception("Agreement id already exists")
        if not terms.strip():
            raise Exception("Terms cannot be empty")

        # Validate the counterparty address, store it back as a hex string.
        party_b_addr = Address(party_b)
        sender = gl.message.sender_address

        self.agreements[agreement_id] = Agreement(
            id=agreement_id,
            party_a=sender.as_hex,
            party_b=party_b_addr.as_hex,
            terms=terms,
            status="active",
            dispute="",
            filed_by="",
            ruling="",
            reasoning="",
            resolution="",
        )

    # ── Write: file a dispute against an existing agreement ──────────────────
    @gl.public.write
    def file_dispute(self, agreement_id: str, statement: str) -> None:
        if agreement_id not in self.agreements:
            raise Exception("Agreement not found")
        if not statement.strip():
            raise Exception("Dispute statement cannot be empty")

        agreement = self.agreements[agreement_id]
        if agreement.status == "resolved":
            raise Exception("Agreement already resolved")

        sender_hex = gl.message.sender_address.as_hex
        if sender_hex not in (agreement.party_a, agreement.party_b):
            raise Exception("Only a party to the agreement may file a dispute")

        agreement.dispute = statement
        agreement.filed_by = sender_hex
        agreement.status = "disputed"

    # ── Write: have the on-chain AI arbiter rule on the dispute ──────────────
    @gl.public.write
    def resolve_dispute(self, agreement_id: str) -> dict:
        if agreement_id not in self.agreements:
            raise Exception("Agreement not found")

        agreement = self.agreements[agreement_id]
        if agreement.status != "disputed":
            raise Exception("No open dispute to resolve")

        sender_hex = gl.message.sender_address.as_hex
        if sender_hex not in (agreement.party_a, agreement.party_b):
            raise Exception("Only a party to the agreement may request a ruling")

        terms = agreement.terms
        dispute = agreement.dispute
        filed_by_role = "PARTY_A" if agreement.filed_by == agreement.party_a else "PARTY_B"

        def leader_fn() -> dict:
            task = f"""You are an impartial arbiter resolving a dispute between two parties,
PARTY_A and PARTY_B, under an agreement they both accepted.

AGREED TERMS:
{terms}

DISPUTE (filed by {filed_by_role}):
{dispute}

Weigh the dispute strictly against the agreed terms. Be fair and neutral; do not
favor the party who filed. If the facts given are not enough to decide, say so.

Respond ONLY with JSON in exactly this shape, nothing else:
{{
    "ruling": str,        // one of "PARTY_A", "PARTY_B", "SPLIT", "INSUFFICIENT_EVIDENCE"
    "reasoning": str,     // 1-3 sentences grounded in the agreed terms
    "resolution": str     // the concrete remedy you recommend
}}
Your output must be valid JSON with no prefix, suffix, or formatting."""
            result = gl.nondet.exec_prompt(task, response_format="json")
            ruling = str(result.get("ruling", "")).strip().upper()
            if ruling not in ALLOWED_RULINGS:
                ruling = "INSUFFICIENT_EVIDENCE"
            return {
                "ruling": ruling,
                "reasoning": str(result.get("reasoning", "")).strip(),
                "resolution": str(result.get("resolution", "")).strip(),
            }

        def validator_fn(leader_result) -> bool:
            # Real consensus, not a format check. First reject anything that is
            # not a well-formed verdict with a ruling from the bounded set.
            if not isinstance(leader_result, glvm.Return):
                return False
            data = leader_result.calldata
            if not (
                isinstance(data, dict)
                and data.get("ruling") in ALLOWED_RULINGS
                and bool(str(data.get("reasoning", "")).strip())
            ):
                return False
            # Then judge the dispute independently and agree only if this
            # validator reaches the SAME bounded ruling as the leader. Bounding
            # the output to a small categorical set is what makes consensus on a
            # subjective AI judgment tractable — that is the reusable primitive.
            own = leader_fn()
            return own["ruling"] == data["ruling"]

        verdict = glvm.run_nondet_unsafe(leader_fn, validator_fn)

        agreement.ruling = verdict["ruling"]
        agreement.reasoning = verdict["reasoning"]
        agreement.resolution = verdict["resolution"]
        agreement.status = "resolved"

        return verdict

    # ── Views ────────────────────────────────────────────────────────────────
    @gl.public.view
    def get_agreement(self, agreement_id: str) -> dict:
        if agreement_id not in self.agreements:
            raise Exception("Agreement not found")
        a = self.agreements[agreement_id]
        return {
            "id": a.id,
            "party_a": a.party_a,
            "party_b": a.party_b,
            "terms": a.terms,
            "status": a.status,
            "dispute": a.dispute,
            "filed_by": a.filed_by,
            "ruling": a.ruling,
            "reasoning": a.reasoning,
            "resolution": a.resolution,
        }

    @gl.public.view
    def get_ruling(self, agreement_id: str) -> dict:
        if agreement_id not in self.agreements:
            raise Exception("Agreement not found")
        a = self.agreements[agreement_id]
        return {
            "status": a.status,
            "ruling": a.ruling,
            "reasoning": a.reasoning,
            "resolution": a.resolution,
        }
