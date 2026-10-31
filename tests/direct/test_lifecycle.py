"""End-to-end lifecycle: create -> accept -> file_dispute -> respond -> resolve."""

from conftest import CHORES_TERMS, GROUP_PROJECT_TERMS, ARBITER, set_time, ruling_json, to_hex


def test_full_roommate_chores_flow(direct_vm, ju, events, direct_alice, direct_bob):
    direct_vm.sender = direct_alice
    ju.create_agreement("chores-1", to_hex(direct_bob), CHORES_TERMS, 48)
    assert ju.get_status("chores-1") == "PROPOSED"

    direct_vm.sender = direct_bob
    ju.accept_agreement("chores-1")
    assert ju.get_status("chores-1") == "ACTIVE"

    direct_vm.sender = direct_alice
    ju.file_dispute("chores-1", "Ben skipped the dishes on Tuesday and Wednesday night.")
    a = ju.get_agreement("chores-1")
    assert a["status"] == "DISPUTED"
    assert a["filed_by"] == to_hex(direct_alice)
    assert a["response_deadline"] == "2026-11-03T12:00:00Z"

    set_time(direct_vm, "2026-11-02T09:00:00Z")
    direct_vm.sender = direct_bob
    ju.respond("chores-1", "I was sick on Tuesday. I did skip Wednesday.")

    direct_vm.mock_llm(ARBITER, ruling_json("PARTY_A"))
    out = ju.resolve_dispute("chores-1")
    assert out["ruling"] == "PARTY_A"
    assert out["coerced"] is False

    r = ju.get_ruling("chores-1")
    assert r["status"] == "RESOLVED"
    assert r["ruling"] == "PARTY_A"
    a = ju.get_agreement("chores-1")
    assert a["resolved_by"] == to_hex(direct_bob)
    assert a["resolved_at"] == "2026-11-02T09:00:00Z"

    assert [e["name"] for e in events] == [
        "AgreementProposed", "AgreementAccepted", "DisputeFiled",
        "DisputeResponded", "DisputeResolved",
    ]
    assert events[0]["agreement_id"] == "chores-1"
    assert events[-1]["ruling"] == "PARTY_A"


def test_group_project_split_ruling_filed_by_party_b(direct_vm, ju, make_active, direct_alice, direct_bob):
    make_active("history-deck", GROUP_PROJECT_TERMS)
    direct_vm.sender = direct_bob
    ju.file_dispute("history-deck", "The title slide lists Ana for the slides too, but I designed them.")
    direct_vm.sender = direct_alice
    ju.respond("history-deck", "I fixed four slides the night before, so I added my name.")
    # The prompt must name PARTY_B as filer and PARTY_A as responder.
    direct_vm.mock_llm(
        r"DISPUTE_FILED_BY_PARTY_B[\s\S]*RESPONSE_FROM_PARTY_A",
        ruling_json("SPLIT", "Both contributed to slides.", "List both names on the slide section."),
    )
    assert ju.resolve_dispute("history-deck")["ruling"] == "SPLIT"


def test_resolve_after_window_without_response(direct_vm, ju, make_disputed, direct_bob):
    make_disputed(window=24)
    set_time(direct_vm, "2026-11-02T12:00:01Z")
    direct_vm.mock_llm(r"No response was submitted", ruling_json("PARTY_A"))
    direct_vm.sender = direct_bob
    assert ju.resolve_dispute("chores-1")["ruling"] == "PARTY_A"
    assert ju.get_agreement("chores-1")["response"] == ""


def test_cancel_proposal(direct_vm, ju, events, direct_alice, direct_bob):
    direct_vm.sender = direct_alice
    ju.create_agreement("rule-1", to_hex(direct_bob), "Quiet hours are 10pm to 7am on weeknights.", 24)
    direct_vm.sender = direct_bob
    ju.cancel_agreement("rule-1")
    assert ju.get_status("rule-1") == "CANCELLED"
    assert events[-1]["name"] == "AgreementCancelled"
    assert events[-1]["cancelled_by"] == to_hex(direct_bob)
