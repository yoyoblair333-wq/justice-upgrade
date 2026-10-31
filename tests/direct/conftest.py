"""Shared fixtures for the direct-mode tests.

genlayer-test (gltest) ships a pytest plugin that already provides the
`direct_vm`, `direct_deploy`, `direct_alice`, `direct_bob` and
`direct_charlie` fixtures (gltest/direct/pytest_plugin.py). Direct mode runs
the contract in-process against the real GenVM Python SDK (downloaded once
into ~/.cache/gltest-direct) with every LLM call mocked by regex.

This file adds the project-specific pieces on top of those fixtures.
"""

import json
import os
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
CONTRACT = str(ROOT / "contracts" / "justice_upgrade.py")

# Pin the GenVM release the SDK is loaded from. Without this, gltest uses
# whatever is cached or the latest GitHub release, which varies per machine.
GENVM_VERSION = os.environ.get("GENVM_VERSION", "v0.2.16")

T0 = "2026-11-01T12:00:00Z"
ARBITER = r"neutral arbiter"   # regex that matches the contract's prompt

EVENT_NAMES = (
    "AgreementProposed",
    "AgreementAccepted",
    "AgreementCancelled",
    "DisputeFiled",
    "DisputeResponded",
    "DisputeResolved",
)

# Non-commerce example agreements used throughout the tests and README.
CHORES_TERMS = (
    "Roommates' chore agreement. Ana (party A) takes out the trash every Monday "
    "and Thursday night. Ben (party B) washes the dishes every evening before "
    "11pm. Whoever misses a turn does the other person's chore the next day."
)
GROUP_PROJECT_TERMS = (
    "Group-project credit agreement for our history presentation. Party A writes "
    "the research section and party B designs the slides. The title slide lists "
    "each person next to the section they actually completed."
)


def to_hex(addr) -> str:
    if hasattr(addr, "as_hex"):
        return addr.as_hex.lower()
    return "0x" + bytes(addr).hex()


def set_time(vm, ts: str) -> None:
    """Move the transaction clock.

    gltest 0.29 `vm.warp()` updates datetime.now() but not
    gl.message_raw["datetime"], which is the deterministic transaction time
    the contract reads. Update both.
    """
    vm.warp(ts)
    gl = sys.modules.get("genlayer.gl")
    if gl is not None and getattr(gl, "message_raw", None) is not None:
        gl.message_raw["datetime"] = ts


def ruling_json(ruling="PARTY_B", reasoning="Ben agreed to wash dishes nightly and did not.",
                resolution="Ben does the dishes for the next three nights.") -> str:
    return json.dumps({"ruling": ruling, "reasoning": reasoning, "resolution": resolution})


@pytest.fixture
def events(direct_vm):
    """Capture gl.Event emissions.

    Direct mode has no built-in handler for the EmitEvent host call (the SDK
    then silently drops the event). gltest exposes `_gl_call_hook` for
    unhandled host calls; we use it to record events so tests can assert on
    them.
    """
    captured = []

    def hook(vm, request):
        if isinstance(request, dict) and "EmitEvent" in request:
            from genlayer.py.keccak import Keccak256

            topic0 = bytes(request["EmitEvent"]["topics"][0])
            name = "?"
            for n in EVENT_NAMES:
                if Keccak256(f"{n}(agreement_id)".encode()).digest() == topic0:
                    name = n
            captured.append({"name": name, **dict(request["EmitEvent"]["blob"])})
            return {"ok": None}
        return None

    direct_vm._gl_call_hook = hook
    yield captured
    direct_vm._gl_call_hook = None


@pytest.fixture
def ju(direct_vm, direct_deploy, direct_alice):
    """A freshly deployed JusticeUpgrade with the clock at T0."""
    direct_vm.sender = direct_alice
    c = direct_deploy(CONTRACT, sdk_version=GENVM_VERSION)
    set_time(direct_vm, T0)
    return c


@pytest.fixture
def make_active(direct_vm, ju, direct_alice, direct_bob):
    """Return a helper that creates + accepts an agreement (alice=A, bob=B)."""

    def _make(aid="chores-1", terms=CHORES_TERMS, window=48):
        direct_vm.sender = direct_alice
        ju.create_agreement(aid, to_hex(direct_bob), terms, window)
        direct_vm.sender = direct_bob
        ju.accept_agreement(aid)
        return aid

    return _make


@pytest.fixture
def make_disputed(direct_vm, ju, make_active, direct_alice):
    """Return a helper that leaves an agreement DISPUTED, filed by alice."""

    def _make(aid="chores-1", claim="Ben skipped the dishes on Tuesday and Wednesday night.",
              terms=CHORES_TERMS, window=48):
        make_active(aid, terms, window)
        direct_vm.sender = direct_alice
        ju.file_dispute(aid, claim)
        return aid

    return _make
