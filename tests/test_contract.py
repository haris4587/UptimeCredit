"""Direct-mode checks for permissions, deadlines, and immutable commitments."""
import hashlib
import time
from datetime import datetime, timezone
import pytest

TERMS = "Covered: total service unavailability. Excluded: scheduled maintenance."
STATUS = b"Incident log, fixed snapshot\n"


def deploy(direct_deploy):
    return direct_deploy(
        "contracts/uptime_credit.py", TERMS,
        hashlib.sha256(TERMS.encode()).hexdigest(),
        "https://example.org/immutable/status.txt",
        hashlib.sha256(STATUS).hexdigest(),
        7, 1, 5, 30, 120, 1000, 2500, 5000,
    )


def test_enrollment_and_duplicate_claim(direct_vm, direct_deploy, direct_alice):
    contract = deploy(direct_deploy)
    with direct_vm.prank(direct_alice):
        with direct_vm.expect_revert("provider only"):
            contract.enroll(str(direct_alice), 10**18)
    contract.enroll(str(direct_alice), 10**18)
    with direct_vm.expect_revert("already enrolled"):
        contract.enroll(str(direct_alice), 2 * 10**18)
    now = int(time.time())
    with direct_vm.prank(direct_alice):
        claim_id = contract.claim(now - 3600, now - 1800)
        assert claim_id == 1
        with direct_vm.expect_revert("duplicate incident"):
            contract.claim(now - 3600, now - 1800)


def test_evidence_limits_and_parties(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = deploy(direct_deploy)
    contract.enroll(str(direct_alice), 10**18)
    now = int(time.time())
    with direct_vm.prank(direct_alice):
        claim_id = contract.claim(now - 3600, now - 1800)
    digest = hashlib.sha256(b"example").hexdigest()
    with direct_vm.prank(direct_bob):
        with direct_vm.expect_revert("party only"):
            contract.submit_evidence(claim_id, "https://example.org/a", digest, "Unauthorized")
    with direct_vm.prank(direct_alice):
        contract.submit_evidence(claim_id, "https://example.org/a", digest, "Timeline A")
        contract.submit_evidence(claim_id, "https://example.org/b", digest, "Timeline B")
        with direct_vm.expect_revert("customer evidence limit"):
            contract.submit_evidence(claim_id, "https://example.org/c", digest, "Timeline C")
    assert contract.get_claim(claim_id)["customer_count"] == 2


def test_early_resolution_and_no_unapproved_withdraw(direct_vm, direct_deploy, direct_alice):
    contract = deploy(direct_deploy)
    contract.enroll(str(direct_alice), 10**18)
    now = int(time.time())
    with direct_vm.prank(direct_alice):
        claim_id = contract.claim(now - 3600, now - 1800)
        with direct_vm.expect_revert("no withdrawable credit"):
            contract.withdraw(claim_id)
    with direct_vm.expect_revert("full response window"):
        contract.resolve(claim_id)


def test_changed_status_snapshot_blocks_payout(direct_vm, direct_deploy, direct_alice):
    contract = deploy(direct_deploy)
    contract.enroll(str(direct_alice), 10**18)
    now = int(time.time())
    with direct_vm.prank(direct_alice):
        claim_id = contract.claim(now - 3600, now - 1800)
        contract.submit_evidence(
            claim_id, "https://example.org/immutable/customer.txt",
            hashlib.sha256(b"customer timeline").hexdigest(), "Customer timeline")
    direct_vm.mock_web(r"example\.org/immutable/status\.txt", {"status": 200, "body": "changed status"})
    direct_vm.warp(datetime.fromtimestamp(now + 3700, timezone.utc).isoformat())
    contract.resolve(claim_id)
    claim = contract.get_claim(claim_id)
    assert claim["status"] == "BLOCKED"
    assert claim["payout_wei"] == "0"


def test_covered_credit_is_deterministic_and_reserved(direct_vm, direct_deploy, direct_alice):
    contract = deploy(direct_deploy)
    contract.enroll(str(direct_alice), 10**18)
    direct_vm.value = 2 * 10**18
    contract.fund()
    direct_vm.value = 0
    now = int(time.time())
    with direct_vm.prank(direct_alice):
        claim_id = contract.claim(now - 3600, now - 1800)
        contract.submit_evidence(
            claim_id, "https://example.org/immutable/customer.txt",
            hashlib.sha256(b"customer timeline").hexdigest(), "Customer timeline")
    direct_vm.mock_web(r"example\.org/immutable/status\.txt", {"status": 200, "body": STATUS.decode()})
    direct_vm.mock_web(r"example\.org/immutable/customer\.txt", {"status": 200, "body": "customer timeline"})
    direct_vm.mock_llm(r"You adjudicate a SaaS SLA claim", '{"result":"COVERED","minutes":30}')
    direct_vm.warp(datetime.fromtimestamp(now + 3700, timezone.utc).isoformat())
    contract.resolve(claim_id)
    c = contract.get_claim(claim_id)
    assert c["status"] == "APPROVED", c["reason"]
    assert c["credit_bps"] == 2500
    assert c["payout_wei"] == str(25 * 10**16)
    assert contract.get_config()["pool_wei"] == str(175 * 10**16)
