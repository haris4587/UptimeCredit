# UptimeCredit

Evidence-bound SaaS service credits on GenLayer. A provider publishes an immutable SLA, fixed credit tiers, a committed status snapshot, customer credit bases, and a funded GEN pool. Customers file outage claims and submit public snapshots; the provider can submit counterevidence in the same fixed window. GenLayer validators independently fetch and compare every byte commitment before interpreting coverage. Deterministic code checks deadlines, limits evidence, computes tiered credits, reserves pool funds, and queues payout.

## Status

The source is implemented and the website is available separately. **No contract address or live claim transaction is asserted in this repository until a finalized Studionet run has been recorded in `deployment.json`.** The web app accepts a deployed address so it can be used without rebuilding after deployment.

## Contract workflow

1. Deploy `contracts/uptime_credit.py` with the constructor arguments shown in `deploy/deploy.mjs`. The terms digest is verified against the terms string in the constructor. Use an immutable HTTPS status snapshot whose exact response bytes match the committed SHA-256.
2. Provider calls payable `fund()` and `enroll(customer, monthly_base_wei)`. Each enrollment base is immutable. The pool holds native GEN, not a fiat billing balance.
3. Enrolled customer calls `claim(start,end)` within seven days of the incident end. Intervals are capped at 30 days and may not overlap or predate a previous claim by that customer.
4. Each party calls `submit_evidence(id,url,sha256,label)` up to twice in the 24-hour response period. Customer evidence is required. All sources must be public HTTPS snapshots, preferably content-addressed or immutable files, and their digest must match the exact response body at review time.
5. Once the full response period ends, anyone calls `resolve(id)`. Every source is independently fetched through `gl.nondet.web.get`. An HTTP error, changed body, oversized response, materially conflicting report, or insufficient facts leaves the claim `BLOCKED`. Resubmission and automatic overrides are not allowed. A blocked claim may be retried only if the same committed sources become reachable and byte-identical; changed commitments stay blocked.
6. An approved customer calls `withdraw(id)`. The status becomes `PAYMENT_QUEUED`; an external EOA transfer is emitted at finalization. Inspect the child/external message to verify delivery. Failed cross-layer messages may not refund automatically; this contract does not claim that queued means paid.

The on-chain prompt treats page text as untrusted data. Coverage judgment and verified outage minutes are the only nondeterministic inputs into the payout formula. Results use comparative validator consensus with exact result and minute agreement. The contract does not authorize redaction, mutable evidence replacement, arbitrary provider withdrawal, or customer changes to credit bases.

## Local development

- Node 22+, Python 3.12+.
- Install JS dependencies with `pnpm install` and run `pnpm build` or `pnpm dev`.
- For contract tests: `pip install genlayer-test genvm-linter pytest`, then `bash scripts/test-contract.sh`. The helper resolves the contract SDK through the GenVM linter. Twelve direct-mode cases cover access control, duplicate claims, evidence limits, premature resolution, changed and conflicting sources, unsafe URLs, and a covered credit with pool reservation.
- The web app uses `genlayer-js@1.1.8` on stable Studionet (chain 61999), a browser EIP-1193 wallet for writes, and `TransactionHashVariant.LATEST_FINAL` for reads. It does not store a signing key.
- Set `NEXT_PUBLIC_CONTRACT_ADDRESS` at build time to pin a deployment, or enter an address in the UI. A browser-local address preference is only a convenience and never claims a deployment exists.

## Deploy and run

Fund a dedicated Studionet account through Studio. Serve a stable immutable status snapshot. Then set `GENLAYER_PRIVATE_KEY`, `STATUS_SNAPSHOT_URL`, `STATUS_SNAPSHOT_SHA256` in your shell and run `node deploy/deploy.mjs`. The script waits for a finalized successful transaction and writes `deployment.json`. Never commit secrets. The example defaults are seven days for claims, 24 hours for responses, five minutes minimum; credits are 10% below 30 minutes, 25% from 30 to 119 minutes, and 50% from 120 minutes. Use small test amounts first.

A real end-to-end test requires two funded wallets, an immutable status snapshot and customer snapshot, a full response window, and finalized receipts for funding, enrollment, claim, evidence, resolve, and withdrawal. Record hashes and delivery verification in a separate run log. A local UI build or mocked contract test is not that test.

## Documentation consulted

[Web Access](https://docs.genlayer.com/developers/intelligent-contracts/features/web-access) · [Equivalence Principle](https://docs.genlayer.com/developers/intelligent-contracts/equivalence-principle) · [Value Transfers](https://docs.genlayer.com/developers/intelligent-contracts/features/value-transfers) · [Transaction Context](https://docs.genlayer.com/developers/intelligent-contracts/features/transaction-context) · [SDK](https://docs.genlayer.com/api-references/genlayer-js) · [Studionet](https://docs.genlayer.com/developers/networks)
