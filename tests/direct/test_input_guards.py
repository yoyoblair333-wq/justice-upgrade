"""Empty input, length caps, ids, addresses and window bounds."""

import pytest

from conftest import CHORES_TERMS, to_hex


@pytest.fixture
def as_alice(direct_vm, ju, direct_alice):
    direct_vm.sender = direct_alice
    return ju


@pytest.mark.parametrize("terms", ["", "   ", "\n\t  \n", "​​"])
def test_empty_terms_rejected(direct_vm, as_alice, direct_bob, terms):
    with direct_vm.expect_revert("terms is empty"):
        as_alice.create_agreement("a1", to_hex(direct_bob), terms, 24)


@pytest.mark.parametrize("stmt", ["", "    ", "⁠"])
def test_empty_statement_rejected(direct_vm, ju, make_active, direct_alice, stmt):
    make_active()
    direct_vm.sender = direct_alice
    with direct_vm.expect_revert("statement is empty"):
        ju.file_dispute("chores-1", stmt)
    assert ju.get_status("chores-1") == "ACTIVE"


def test_empty_response_rejected(direct_vm, ju, make_disputed, direct_bob):
    make_disputed()
    direct_vm.sender = direct_bob
    with direct_vm.expect_revert("statement is empty"):
        ju.respond("chores-1", "   ")


def test_terms_length_cap(direct_vm, as_alice, direct_bob):
    as_alice.create_agreement("ok", to_hex(direct_bob), "a" * 2000, 24)
    with direct_vm.expect_revert("terms exceeds 2000 characters"):
        as_alice.create_agreement("too-long", to_hex(direct_bob), "a" * 2001, 24)


def test_statement_length_cap(direct_vm, ju, make_active, direct_alice):
    make_active()
    direct_vm.sender = direct_alice
    with direct_vm.expect_revert("statement exceeds 1500 characters"):
        ju.file_dispute("chores-1", "b" * 1501)
    ju.file_dispute("chores-1", "b" * 1500)


@pytest.mark.parametrize("aid,msg", [
    ("", "agreement_id is empty"),
    ("x" * 65, "agreement_id exceeds 64 characters"),
    ("has space", "agreement_id may only use"),
    ("-leading-dash", "agreement_id may only use"),
    ("emoji❤", "agreement_id may only use"),
])
def test_bad_agreement_ids(direct_vm, as_alice, direct_bob, aid, msg):
    with direct_vm.expect_revert(msg):
        as_alice.create_agreement(aid, to_hex(direct_bob), CHORES_TERMS, 24)


@pytest.mark.parametrize("addr", ["not-an-address", "0x1234", ""])
def test_invalid_party_b(direct_vm, as_alice, addr):
    with direct_vm.expect_revert("party_b is not a valid address"):
        as_alice.create_agreement("a1", addr, CHORES_TERMS, 24)


def test_party_b_cannot_be_self(direct_vm, as_alice, direct_alice):
    with direct_vm.expect_revert("party_b must be a different address"):
        as_alice.create_agreement("a1", to_hex(direct_alice), CHORES_TERMS, 24)


@pytest.mark.parametrize("hours", [0, -5, 721])
def test_window_bounds(direct_vm, as_alice, direct_bob, hours):
    with direct_vm.expect_revert("response_window_hours must be between 1 and 720"):
        as_alice.create_agreement("a1", to_hex(direct_bob), CHORES_TERMS, hours)


@pytest.mark.parametrize("hours", [1, 720])
def test_window_edges_allowed(as_alice, direct_bob, hours):
    as_alice.create_agreement("a1", to_hex(direct_bob), CHORES_TERMS, hours)
    assert as_alice.get_agreement("a1")["response_window_hours"] == hours


def test_window_must_be_int(direct_vm, as_alice, direct_bob):
    with direct_vm.expect_revert("response_window_hours must be an integer"):
        as_alice.create_agreement("a1", to_hex(direct_bob), CHORES_TERMS, True)
