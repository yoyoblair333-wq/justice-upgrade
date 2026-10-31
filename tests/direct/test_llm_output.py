"""Bounded output: out-of-set coercion and fail-closed handling of bad replies."""

import json

import pytest

from conftest import ARBITER, ruling_json


@pytest.fixture
def ready(direct_vm, ju, make_disputed, direct_bob):
    make_disputed()
    direct_vm.sender = direct_bob
    ju.respond("chores-1", "I was sick on Tuesday.")
    return ju


@pytest.mark.parametrize("weird", ["MAYBE", "BOTH", "", "PARTY_C", "ana wins"])
def test_out_of_set_ruling_coerced(direct_vm, ready, weird):
    direct_vm.mock_llm(ARBITER, ruling_json(weird))
    out = ready.resolve_dispute("chores-1")
    assert out["ruling"] == "INSUFFICIENT_EVIDENCE"
    assert out["coerced"] is True
    assert ready.get_ruling("chores-1")["coerced"] is True


def test_non_string_ruling_coerced(direct_vm, ready):
    direct_vm.mock_llm(ARBITER, json.dumps({"ruling": 1, "reasoning": "r", "resolution": "x"}))
    assert ready.resolve_dispute("chores-1")["ruling"] == "INSUFFICIENT_EVIDENCE"


@pytest.mark.parametrize("raw,expected", [
    ("party_a", "PARTY_A"),
    ("  Party_B ", "PARTY_B"),
    ("split", "SPLIT"),
    ("insufficient evidence", "INSUFFICIENT_EVIDENCE"),
])
def test_case_and_spacing_normalised(direct_vm, ready, raw, expected):
    direct_vm.mock_llm(ARBITER, ruling_json(raw))
    out = ready.resolve_dispute("chores-1")
    assert out["ruling"] == expected
    assert out["coerced"] is False


@pytest.mark.parametrize("bad", [
    "I think Ana is right.",                                       # not JSON
    json.dumps(["PARTY_A"]),                                       # not an object
    json.dumps({"ruling": "PARTY_A"}),                             # no reasoning
    json.dumps({"ruling": "PARTY_A", "reasoning": "   "}),         # blank reasoning
    json.dumps({"ruling": "PARTY_A", "reasoning": 42}),            # wrong type
])
def test_malformed_reply_fails_closed(direct_vm, ready, bad):
    direct_vm.mock_llm(ARBITER, bad)
    with direct_vm.expect_revert("[LLM_ERROR]"):
        ready.resolve_dispute("chores-1")
    a = ready.get_agreement("chores-1")
    assert a["status"] == "DISPUTED"
    assert a["ruling"] == ""


def test_retry_after_llm_error_succeeds(direct_vm, ready):
    direct_vm.mock_llm(ARBITER, "not json at all")
    with direct_vm.expect_revert("[LLM_ERROR]"):
        ready.resolve_dispute("chores-1")
    direct_vm.clear_mocks()
    direct_vm.mock_llm(ARBITER, ruling_json("PARTY_B"))
    assert ready.resolve_dispute("chores-1")["ruling"] == "PARTY_B"


def test_fenced_json_string_parsed(direct_vm, ready):
    direct_vm.mock_llm(ARBITER, '```json\n{"ruling": "SPLIT", "reasoning": "Both partly right.", "resolution": "Alternate."}\n```')
    assert ready.resolve_dispute("chores-1")["ruling"] == "SPLIT"


def test_long_fields_truncated(direct_vm, ready):
    direct_vm.mock_llm(ARBITER, ruling_json("PARTY_A", "r" * 2000, "s" * 2000))
    out = ready.resolve_dispute("chores-1")
    assert len(out["reasoning"]) == 600
    assert len(out["resolution"]) == 400


def test_missing_resolution_allowed(direct_vm, ready):
    direct_vm.mock_llm(ARBITER, json.dumps({"ruling": "PARTY_B", "reasoning": "Dishes were skipped."}))
    out = ready.resolve_dispute("chores-1")
    assert out["ruling"] == "PARTY_B"
    assert out["resolution"] == ""
