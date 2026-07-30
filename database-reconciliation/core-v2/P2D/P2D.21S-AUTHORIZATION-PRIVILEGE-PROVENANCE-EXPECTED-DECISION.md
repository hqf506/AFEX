# P2D.21S Expected Decision Rules

No outcome is selected before Production evidence is reviewed.

## A. VERIFIER_ONLY_CORRECTION

Choose A only when:

- the fourteen authenticated column ACLs and eleven Core V2 ACLs exactly
  match the P2D.21R canonical contract;
- no unexpected direct table ACL, membership-derived privilege, PUBLIC
  privilege, or default-privilege drift broadens the intended contract;
- effective privileges are fully explained by approved ACLs plus reviewed
  RLS policies;
- P2D.21D is the only inconsistent artifact.

## B. FORWARD_ACL_MIGRATION_REQUIRED

Choose B when:

- an explicit table, column, schema, PUBLIC, membership, or default privilege
  exceeds the approved contract;
- removal does not require changing a current authenticated application path;
- exact grantor, grantee, rollback, RLS, and compatibility effects are known.

Any mutation requires a separate externally reviewed forward migration.

## C. APPLICATION_REFACTOR_REQUIRED_FIRST

Choose C when:

- an excessive privilege is actively required by a browser or authenticated
  server path;
- least privilege requires moving that path behind a reviewed server or RPC
  boundary before the privilege can be removed.

## D. ADDITIONAL_EVIDENCE_REQUIRED

Choose D when:

- any privilege source remains unattributed;
- role inheritance, ownership, superuser behavior, PUBLIC access, default
  privileges, or RLS applicability is ambiguous;
- catalog evidence and effective privilege functions disagree;
- the result cannot distinguish a verifier defect from unsafe Production
  state.

## Deterministic precedence

Apply outcomes in this order:

1. D if evidence is incomplete or contradictory.
2. C if an unsafe privilege has a proven live application dependency.
3. B if an unsafe privilege is proven removable without application change.
4. A only when the entire effective contract is proven safe and the verifier
   alone is stale.
