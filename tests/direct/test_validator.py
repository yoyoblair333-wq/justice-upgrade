"""Validator logic: re-judge independently, agree only on the same ruling.

Direct mode runs the leader once and captures the validator closure; the
test then replays it with `direct_vm.run_validator()`, swapping LLM mocks to
simulate what an independent validator's model would answer. A validator
that returns False is a "disagree" vote: on a real GenLayer network, if the
majority disagree the leader's result is not committed (no consensus; the
leader rotates). That network step itself needs a live network to observe.
"""

import pytest

from conftest import ARBITER, ruling_json


@pytest.fixture
def resolved(direct_vm, ju, make_disputed, direct_bob):
    make_disputed()
    direct_vm.sender = direct_bob
    ju.respond("chores-1", "I was sick on Tuesday.")
    direct_vm.mock_llm(ARBITER, ruling_json("PARTY_A", "Ben missed two nights."))
    ju.resolve_dispute("chores-1")
    return ju


def test_agrees_with_identical_rejudgement(direct_vm, resolved):
    assert direct_vm.run_validator() is True


def test_agrees_when_only_wording_differs(direct_vm, resolved):
    direct_vm.clear_mocks()
    direct_vm.mock_llm(ARBITER, ruling_json("PARTY_A", "Completely different words.", "Other fix."))
    assert direct_vm.run_validator() is True


@pytest.mark.parametrize("other", ["PARTY_B", "SPLIT", "INSUFFICIENT_EVIDENCE"])
def test_disagrees_on_different_ruling(direct_vm, resolved, other):
    direct_vm.clear_mocks()
    direct_vm.mock_llm(ARBITER, ruling_json(other))
    assert direct_vm.run_validator() is False


def test_out_of_set_on_validator_side_disagrees_with_real_ruling(direct_vm, resolved):
    # Validator's model answers garbage -> coerced to INSUFFICIENT_EVIDENCE,
    # which does not match the leader's PARTY_A -> no consensus.
    direct_vm.clear_mocks()
    direct_vm.mock_llm(ARBITER, ruling_json("MAYBE"))
    assert direct_vm.run_validator() is False


def test_disagrees_when_own_model_fails(direct_vm, resolved):
    direct_vm.clear_mocks()
    direct_vm.mock_llm(ARBITER, "this is not json")
    assert direct_vm.run_validator() is False


def test_disagrees_with_leader_error(direct_vm, resolved):
    assert direct_vm.run_validator(leader_error=Exception("[LLM_ERROR] boom")) is False


@pytest.mark.parametrize("tampered", [
    {"ruling": "ANA_WINS", "reasoning": "x", "resolution": "", "coerced": False},
    {"ruling": "PARTY_A", "reasoning": "", "resolution": "", "coerced": False},
    {"ruling": "PARTY_A", "reasoning": "x" * 601, "resolution": "", "coerced": False},
    {"ruling": "PARTY_A", "reasoning": "x", "resolution": "", "coerced": False, "extra": 1},
    {"ruling": "PARTY_A", "reasoning": "x", "resolution": ""},
    {"ruling": "PARTY_A", "reasoning": "x", "resolution": "", "coerced": "no"},
    ["PARTY_A"],
    "PARTY_A",
])
def test_disagrees_with_tampered_payload(direct_vm, resolved, tampered):
    assert direct_vm.run_validator(leader_result=tampered) is False


def test_coerced_leader_and_coerced_validator_agree(direct_vm, ju, make_disputed, direct_bob):
    make_disputed()
    direct_vm.sender = direct_bob
    ju.respond("chores-1", "I was sick on Tuesday.")
    direct_vm.mock_llm(ARBITER, ruling_json("MAYBE"))
    assert ju.resolve_dispute("chores-1")["ruling"] == "INSUFFICIENT_EVIDENCE"
    direct_vm.clear_mocks()
    direct_vm.mock_llm(ARBITER, ruling_json("INSUFFICIENT_EVIDENCE"))
    assert direct_vm.run_validator() is True
