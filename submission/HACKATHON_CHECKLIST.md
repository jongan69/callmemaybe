# Hackathon submission gate

This checklist governs Devpost submission only. The separate Shopify App Store
gate remains in `RELEASE_READINESS.md`.

## Repository candidate

- [x] WIP backup is checksum-verified; temporary integration stashes were
      removed only after the remote merge and external archive were verified.
- [x] Security and production WIP are reconciled on `dev`.
- [x] `npm run ci:verify` and Shopify configuration validation pass.
- [x] Empty PostgreSQL migration, normal seed, and queue initialization pass.
- [x] [`dev → main` PR #4](https://github.com/jongan69/callmemaybe/pull/4)
      passed CI/security review and was merged.
- [x] Remote `main` and `dev` point to the same merged candidate.

## Live demo environment

- [ ] Paid Render database, web, and worker services are healthy on one SHA.
- [ ] Protected secrets are configured; demo/runtime bypasses remain false.
- [ ] `/health/live` and `/health/ready` return 200.
- [ ] Shopify application/redirect URLs and extensions are deployed.
- [ ] The app is installed on the development store.
- [ ] A synthetic order exists with Phone B and no real customer data.
- [ ] The one-off guarded seed reused the installed shop and Phone A endpoint.
- [ ] One controlled carrier call completed end to end.
- [ ] The structured result, proposal, approval, Shopify action, and audit receipt
      were verified.
- [ ] A completed fallback case is ready for recording.

## Video and Devpost

- [ ] 2:45–2:55 captioned 1080p demo recorded without secrets or PII.
- [ ] Public YouTube/Vimeo playback verified signed out.
- [ ] Repository, merged community PR, video, and optional live URL verified.
- [ ] CALL-E email and true eligibility/conflict answers entered by submitter.
- [ ] Every submitted link verified signed out.
- [ ] Devpost visibly confirms final submission; confirmation URL and screenshot
      are saved.
