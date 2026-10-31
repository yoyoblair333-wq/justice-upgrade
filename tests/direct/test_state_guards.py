"""Explicit status enum: every transition requires the exact prior status."""

from conftest import ARBITER, CHORES_TERMS, set_time, ruling_json, to_hex


def test_duplicate_id_rejected(direct_vm, ju, direct_alice, direct_bob):
    direct_vm.sender = direct_alice
    ju.create_agreement("a1", to_hex(direct_bob), CHORES_TERMS, 24)
    with direct_vm.expect_revert("agreement id already exists"):
        ju.create_agreement("a1", to_hex(direct_bob), "Different terms entirely.", 24)


def test_cannot_dispute_before_acceptance(direct_vm, ju, direct_alice, direct_bob):
    direct_vm.sender = direct_alice
    ju.create_agreement("a1", to_hex(direct_bob), CHORES_TERMS, 24)
    with direct_vm.expect_revert("agreement is PROPOSED, expected ACTIVE"):
        ju.file_dispute("a1", "Ben skipped the dishes.")


def test_cannot_dispute_cancelled(direct_vm, ju, direct_alice, direct_bob):
    direct_vm.sender = direct_alice
    ju.create_agreement("a1", to_hex(direct_bob), CHORES_TERMS, 24)
    ju.cancel_agreement("a1")
    with direct_vm.expect_revert("agreement is CANCELLED"):
        ju.file_dispute("a1", "Ben skipped the dishes.")
    direct_vm.sender = direct_bob
    with direct_vm.expect_revert("agreement is CANCELLED"):
        ju.accept_agreement("a1")


def test_cannot_cancel_after_acceptance(direct_vm, ju, make_active, direct_alice):
    make_active()
    direct_vm.sender = direct_alice
    with direct_vm.expect_revert("cannot cancel: agreement is ACTIVE"):
        ju.cancel_agreement("chores-1")


def test_cannot_accept_twice(direct_vm, ju, make_active, direct_bob):
    make_active()
    direct_vm.sender = direct_bob
    with direct_vm.expect_revert("cannot accept: agreement is ACTIVE"):
        ju.accept_agreement("chores-1")


def test_cannot_resolve_without_dispute(direct_vm, ju, make_active, direct_alice):
    make_active()
    direct_vm.sender = direct_alice
    with direct_vm.expect_revert("cannot resolve: agreement is ACTIVE"):
        ju.resolve_dispute("chores-1")


def test_second_dispute_while_open_rejected(direct_vm, ju, make_disputed, direct_bob):
    make_disputed()
    direct_vm.sender = direct_bob
    with direct_vm.expect_revert("cannot file a dispute: agreement is DISPUTED"):
        ju.file_dispute("chores-1", "Counter-dispute: Ana forgot the trash too.")


def test_cannot_respond_twice(direct_vm, ju, make_disputed, direct_bob):
    make_disputed()
    direct_vm.sender = direct_bob
    ju.respond("chores-1", "I was sick on Tuesday.")
    with direct_vm.expect_revert("a response has already been submitted"):
        ju.respond("chores-1", "Actually, let me rephrase.")
    assert ju.get_agreement("chores-1")["response"] == "I was sick on Tuesday."


def test_response_after_deadline_rejected(direct_vm, ju, make_disputed, direct_bob):
    make_disputed(window=24)
    set_time(direct_vm, "2026-11-02T12:00:00Z")   # exactly at deadline: still allowed
    direct_vm.sender = direct_bob
    ju.respond("chores-1", "Made it just in time.")
    make_disputed("chores-2", window=24)          # filed at 2026-11-02T12:00:00Z
    set_time(direct_vm, "2026-11-03T12:00:01Z")
    direct_vm.sender = direct_bob
    with direct_vm.expect_revert("response window has closed"):
        ju.respond("chores-2", "Too late.")


def test_resolve_blocked_while_window_open_and_no_response(direct_vm, ju, make_disputed, direct_alice):
    make_disputed(window=24)
    set_time(direct_vm, "2026-11-02T11:59:59Z")
    direct_vm.mock_llm(ARBITER, ruling_json())
    direct_vm.sender = direct_alice
    with direct_vm.expect_revert("response window is still open"):
        ju.resolve_dispute("chores-1")
    assert ju.get_status("chores-1") == "DISPUTED"


def test_double_resolve_rejected(direct_vm, ju, make_disputed, direct_alice, direct_bob):
    make_disputed()
    direct_vm.sender = direct_bob
    ju.respond("chores-1", "I was sick on Tuesday.")
    direct_vm.mock_llm(ARBITER, ruling_json("PARTY_A"))
    ju.resolve_dispute("chores-1")
    direct_vm.clear_mocks()
    direct_vm.mock_llm(ARBITER, ruling_json("PARTY_B"))
    direct_vm.sender = direct_alice
    with direct_vm.expect_revert("cannot resolve: agreement is RESOLVED"):
        ju.resolve_dispute("chores-1")
    assert ju.get_ruling("chores-1")["ruling"] == "PARTY_A"


def test_resolved_agreement_is_final(direct_vm, ju, make_disputed, direct_bob):
    make_disputed()
    direct_vm.sender = direct_bob
    ju.respond("chores-1", "I was sick on Tuesday.")
    direct_vm.mock_llm(ARBITER, ruling_json())
    ju.resolve_dispute("chores-1")
    with direct_vm.expect_revert("agreement is RESOLVED"):
        ju.file_dispute("chores-1", "Re-opening.")
    with direct_vm.expect_revert("agreement is RESOLVED"):
        ju.respond("chores-1", "Late answer.")


def test_unknown_agreement(direct_vm, ju):
    for call in (lambda: ju.get_agreement("nope"), lambda: ju.accept_agreement("nope"),
                 lambda: ju.file_dispute("nope", "x"), lambda: ju.resolve_dispute("nope")):
        with direct_vm.expect_revert("agreement not found"):
            call()
