"""
Direct-mode tests for JusticeUpgrade.

Run from the boilerplate root with the GenLayer dev tooling installed:
    pytest tests/direct/test_justice_upgrade.py -v

Direct mode runs the contract in-memory and mocks the LLM, so the arbiter's
flow can be tested deterministically without a live network or Studio.
"""


def test_create_and_resolve_dispute(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = direct_deploy("contracts/justice_upgrade.py")

    # Alice records an agreement with Bob.
    direct_vm.sender = direct_alice
    contract.create_agreement(
        "deal-1",
        str(direct_bob),
        "Bob pays Alice 100 for a logo delivered as an SVG by Friday.",
    )

    # Bob files a dispute.
    direct_vm.sender = direct_bob
    contract.file_dispute("deal-1", "Alice delivered a PNG, not an SVG, and it was late.")

    state = contract.get_agreement("deal-1")
    assert state["status"] == "disputed"
    assert state["filed_by"].lower() == str(direct_bob).lower()

    # The on-chain arbiter (LLM) is mocked to rule for Bob.
    direct_vm.mock_llm(
        r".*impartial arbiter.*",
        '{"ruling": "PARTY_B", "reasoning": "Terms required an SVG by Friday; neither was met.", "resolution": "Alice redelivers an SVG or refunds 50."}',
    )
    contract.resolve_dispute("deal-1")

    ruling = contract.get_ruling("deal-1")
    assert ruling["status"] == "resolved"
    assert ruling["ruling"] == "PARTY_B"
    assert "SVG" in ruling["resolution"]


def test_only_a_party_can_dispute(direct_vm, direct_deploy, direct_alice, direct_bob, direct_charlie):
    contract = direct_deploy("contracts/justice_upgrade.py")

    direct_vm.sender = direct_alice
    contract.create_agreement("deal-2", str(direct_bob), "Trade A for B.")

    # Charlie is a stranger to the agreement.
    direct_vm.sender = direct_charlie
    with direct_vm.expect_revert("Only a party to the agreement may file a dispute"):
        contract.file_dispute("deal-2", "I want in.")


def test_cannot_resolve_without_dispute(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = direct_deploy("contracts/justice_upgrade.py")

    direct_vm.sender = direct_alice
    contract.create_agreement("deal-3", str(direct_bob), "Trade A for B.")

    with direct_vm.expect_revert("No open dispute to resolve"):
        contract.resolve_dispute("deal-3")


def test_bounded_ruling_is_enforced(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = direct_deploy("contracts/justice_upgrade.py")

    direct_vm.sender = direct_alice
    contract.create_agreement("deal-4", str(direct_bob), "Ship 10 units on time.")
    direct_vm.sender = direct_bob
    contract.file_dispute("deal-4", "Only 3 units shipped.")

    # If the model returns an out-of-set ruling, it is coerced to the safe default.
    direct_vm.mock_llm(
        r".*impartial arbiter.*",
        '{"ruling": "MAYBE", "reasoning": "unclear", "resolution": "talk it out"}',
    )
    contract.resolve_dispute("deal-4")
    assert contract.get_ruling("deal-4")["ruling"] == "INSUFFICIENT_EVIDENCE"
