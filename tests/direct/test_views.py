"""Read-only views."""

from conftest import CHORES_TERMS, to_hex


def test_rules_view_declares_no_funds(ju):
    r = ju.get_rules()
    assert r["rulings"] == ["PARTY_A", "PARTY_B", "SPLIT", "INSUFFICIENT_EVIDENCE"]
    assert r["statuses"] == ["PROPOSED", "ACTIVE", "DISPUTED", "RESOLVED", "CANCELLED"]
    assert r["holds_funds"] is False


def test_count_and_pagination(direct_vm, ju, direct_alice, direct_bob):
    direct_vm.sender = direct_alice
    for i in range(5):
        ju.create_agreement(f"house-rule-{i}", to_hex(direct_bob), CHORES_TERMS, 24)
    assert ju.get_agreement_count() == 5
    assert ju.list_agreement_ids(0, 2) == ["house-rule-0", "house-rule-1"]
    assert ju.list_agreement_ids(4, 10) == ["house-rule-4"]
    assert ju.list_agreement_ids(9, 10) == []
    with direct_vm.expect_revert("offset and limit must be >= 0"):
        ju.list_agreement_ids(-1, 1)


def test_agreement_view_shape(direct_vm, ju, make_active, direct_alice, direct_bob):
    make_active()
    a = ju.get_agreement("chores-1")
    assert a["party_a"] == to_hex(direct_alice)
    assert a["party_b"] == to_hex(direct_bob)
    assert a["status"] == "ACTIVE"
    assert a["terms"] == CHORES_TERMS
    assert a["created_at"] == "2026-11-01T12:00:00Z"
    assert a["accepted_at"] == "2026-11-01T12:00:00Z"
    assert a["ruling"] == "" and a["claim"] == "" and a["response"] == ""
    assert ju.get_ruling("chores-1") == {
        "status": "ACTIVE", "ruling": "", "reasoning": "", "resolution": "", "coerced": False,
    }
