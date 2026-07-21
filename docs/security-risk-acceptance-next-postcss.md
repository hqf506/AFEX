# Security Risk Acceptance — Next.js Nested PostCSS

## Status

Temporarily accepted pending a stable upstream fix.

Document date: 2026-07-21

Review deadline: 2026-08-20

## Advisory

- Advisory: GHSA-qx2v-qp2m-jg93
- Severity: Moderate
- Affected dependency: Next.js 16.2.10 → nested PostCSS 8.4.31
- Safe PostCSS version: 8.5.10 or later

## Exposure

- PostCSS is used during trusted application build and CSS processing.
- No application flow currently accepts raw CSS from users, tenants, uploads, or external content.
- The affected nested PostCSS version is owned by Next.js and cannot be corrected by updating the root PostCSS dependency.
- The application does not rely on the vulnerable stringification behavior for untrusted CSS input.
- Based on the current architecture, the risk is limited primarily to trusted-input build-time processing.

## Compensating Controls

- Repository and deployment access are restricted.
- Build input comes from reviewed source control.
- No user-supplied CSS path exists.
- Dependency audits are reviewed before release.
- Critical and High unrelated dependency findings were patched in commit `039f43c`.
- The production build and application regression checks pass.

## Rejected Mitigations

- Do not downgrade Next.js.
- Do not use an unsupported PostCSS override.
- Do not use Next.js Canary or Preview in production solely for this fix.
- Do not apply `npm audit fix --force`.

## Resolution Plan

- Upgrade Next.js and `eslint-config-next` together to the first stable compatible version that includes PostCSS 8.5.10 or later.
- Validate the upgrade through a separate dependency phase and a Vercel Preview before production.
- Remove this acceptance after the fixed stable version is deployed.

## Review Trigger

Review immediately when any of the following occurs:

- A stable fixed Next.js release becomes available.
- The application begins accepting user-supplied or tenant-supplied CSS.
- The advisory severity or exploitability changes.
- A related security incident occurs.
- The review deadline is reached.

## Approval Context

This temporary acceptance is based on the advisory's Moderate severity, trusted CSS inputs, no confirmed runtime exploit path in the current architecture, and the absence of a stable low-risk upstream fix at the time of review.
