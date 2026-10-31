"""Only the right party can take each step."""

import pytest

from conftest import ARBITER, CHORES_TERMS, ruling_json, to_hex


def test_stranger_cannot_accept(direct_vm, ju, direct_alice, direct_bob, direct_charlie):
    direct_vm.sender = direct_alice
    ju.create_agreement("a1", to_hex(direct_bob), CHORES_TERMS, 24)
    direct_vm.sender = direct_charlie
    with direct_vm.expect_revert("only party_b may accept"):
        ju.accept_agreement("a1")


def test_party_a_cannot_accept_own_proposal(direct_vm, ju, direct_alice, direct_bob):
    direct_vm.sender = direct_alice
    ju.create_agreement("a1", to_hex(direct_bob), CHORES_TERMS, 24)
    with direct_vm.expect_revert("only party_b may accept"):
        ju.accept_agreement("a1")
    assert ju.get_status("a1") == "PROPOSED"


def test_stranger_cannot_cancel(direct_vm, ju, direct_alice, direct_bob, direct_charlie):
    direct_vm.sender = direct_alice
    ju.create_agreement("a1", to_hex(direct_bob), CHORES_TERMS, 24)
    direct_vm.sender = direct_charlie
    with direct_vm.expect_revert("only a party to the agreement may cancel"):
        ju.cancel_agreement("a1")


def test_stranger_cannot_file_dispute(direct_vm, ju, make_active, direct_charlie):
    make_active()
    direct_vm.sender = direct_charlie
    with direct_vm.expect_revert("only a party to the agreement may file a dispute"):
        ju.file_dispute("chores-1", "I live next door and heard dishes clattering.")
    assert ju.get_status("chores-1") == "ACTIVE"


def test_stranger_cannot_respond(direct_vm, ju, make_disputed, direct_charlie):
    make_disputed()
    direct_vm.sender = direct_charlie
    with direct_vm.expect_revert("only a party to the agreement may respond"):
        ju.respond("chores-1", "Ben was out of town.")


def test_filer_cannot_respond_to_own_dispute(direct_vm, ju, make_disputed, direct_alice):
    make_disputed()
    direct_vm.sender = direct_alice
    with direct_vm.expect_revert("only the other party may respond"):
        ju.respond("chores-1", "Adding more detail to my own complaint.")


def test_stranger_cannot_resolve(direct_vm, ju, make_disputed, direct_bob, direct_charlie):
    make_disputed()
    direct_vm.sender = direct_bob
    ju.respond("chores-1", "I was sick on Tuesday.")
    direct_vm.mock_llm(ARBITER, ruling_json())
    direct_vm.sender = direct_charlie
    with direct_vm.expect_revert("only a party to the agreement may request a ruling"):
        ju.resolve_dispute("chores-1")
    assert ju.get_status("chores-1") == "DISPUTED"


@pytest.mark.parametrize("who", ["direct_alice", "direct_bob"])
def test_either_party_can_resolve(request, direct_vm, ju, make_disputed, direct_bob, who):
    make_disputed()
    direct_vm.sender = direct_bob
    ju.respond("chores-1", "I was sick on Tuesday.")
    direct_vm.mock_llm(ARBITER, ruling_json())
    direct_vm.sender = request.getfixturevalue(who)
    assert ju.resolve_dispute("chores-1")["ruling"] == "PARTY_B"
