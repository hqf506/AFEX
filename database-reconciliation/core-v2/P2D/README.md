# Core V2 P2D Working Structure

## Purpose

This folder is the controlled working area for the AFEX Core V2 P2D phases. It separates reviewed SQL packages, Production controls, contract documents, and review reports from the existing Core V2 packages. Production evidence is retained locally under `evidence/` and excluded from Git.

## Files

- `P2D.14B-read-only-production-preflight.sql` — reviewed read-only Production preflight used to determine the deployed foundation state.
- `P2D.15-FRESH.sql` — authoritative installed Core V2 foundation package for the confirmed `NOT_INSTALLED` Production classification.
- `P2D.16-POST-INSTALL-ATTESTATION.sql` — read-only P2D.15 foundation attestation.
- `P2D.17-DURABLE-IMMUTABLE-COMMAND-ENVELOPE-DESIGN.md` — normative durable command-envelope design.
- `P2D.18-DURABLE-COMMAND-CONTRACT-FREEZE.md` and `P2D.18A-DURABLE-COMMAND-CONTRACT-CLARIFICATION-AMENDMENT.md` — frozen payload, acquisition, executor-sequencing, and activation contracts.
- `P2D.19-DURABLE-IMMUTABLE-PAYLOAD-STORAGE.sql` — authoritative installed P2D.19 migration.
- `P2D.19-POST-INSTALL-ATTESTATION.sql` — read-only attestation for the authoritative P2D.19 migration.
- `P2D.20-TRUSTED-ATOMIC-ACQUISITION.sql` — authoritative installed P2D.20 acquisition package; it includes trusted authorization-context issuance and reviewed internal canonicalization helpers.
- `P2D.20-POST-INSTALL-ATTESTATION.sql` — read-only P2D.20 attestation.
- `P2D.21*` and `P2D.22*` — reviewed preflight, installation, diagnostic, reconciliation, and final-verification controls.

## Historical Placeholder Disposition

The original working structure reserved five empty executable-looking filenames. They never contained SQL, were never tracked or executed, and are not current operator inputs:

- `P2D.15-FORWARD.sql` — historical alternative for an already-installed foundation. Production was classified `NOT_INSTALLED`, so the approved and executed path was `P2D.15-FRESH.sql`; no standalone forward package was required.
- `P2D.16-issue-authorization-context.sql` — responsibility absorbed by `P2D.20-TRUSTED-ATOMIC-ACQUISITION.sql`, which atomically creates the trusted authorization context with the command and immutable payload.
- `P2D.17-internal-helpers.sql` — reviewed canonicalization and acquisition helpers were delivered inside `P2D.20-TRUSTED-ATOMIC-ACQUISITION.sql`; P2D.17 remains the normative design document.
- `P2D.18-execute-atomic-order.sql` — superseded as a filename by the frozen P2D.18 migration breakdown, which explicitly deferred Executor design and implementation to later separately approved work. The current authoritative plan is R1.2 Batch B. No standalone executor SQL exists or is authorized yet.
- `P2D.19-api-cutover.sql` — not the authoritative P2D.19 package. P2D.19 was reassigned by the frozen contract to durable immutable payload storage. Runtime cutover and activation remain separate future work under R1.2 Batches G and N; no standalone API-cutover SQL exists or is authorized.

The five empty files were removed from the authoritative baseline. Historical phase intent is preserved here so operators do not search for or execute the deleted placeholders.

## Execution Order

The completed database-foundation sequence was:

1. `P2D.14B-read-only-production-preflight.sql`
2. External review of the captured classification evidence
3. `P2D.15-FRESH.sql`
4. `P2D.16-POST-INSTALL-ATTESTATION.sql`
5. `P2D.19-DURABLE-IMMUTABLE-PAYLOAD-STORAGE.sql`
6. `P2D.19-POST-INSTALL-ATTESTATION.sql`
7. `P2D.20-TRUSTED-ATOMIC-ACQUISITION.sql`
8. `P2D.20-POST-INSTALL-ATTESTATION.sql`
9. P2D.21/P2D.22 read-only final verification

This completed sequence does not install an Executor, activate Core V2, or cut over application traffic. Future Runtime, Executor, and activation work follows the separately reviewed R1.2 plan.

## Review Workflow

```text
Codex
↓
ChatGPT Review
↓
Manual Execution
↓
Evidence Collection
↓
Next Phase
```

Codex prepares the scoped artifact. ChatGPT Review performs independent source review. An authorized operator performs manual execution only after approval. Execution evidence is captured under `evidence/`, reviewed, and accepted before the next phase begins.
