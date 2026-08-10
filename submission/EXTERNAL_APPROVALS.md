# External approvals and hard gates

Do not replace an unchecked box with a statement of intent. Link the actual
approval, contract, Dashboard result, rehearsal, or production evidence.

## Company, legal, and Shopify

- [ ] Partner identity/business verification and emergency contacts.
- [ ] CallMeMaybe trademark/name and domain clearance.
- [ ] Counsel-approved Privacy Policy, Terms, DPA, Acceptable Use/Calling Policy,
      retention schedule, subprocessor list, security statement, AI/transcription
      disclosure, incident notice terms, and country legal matrix.
- [ ] Shopify Level 2 protected customer data approval for only order-associated
      name, address, and phone fields.
- [ ] Scope justification for `read_orders`, `write_orders`, and
      `read_legal_policies`; confirmation that `read_customers` is absent.
- [ ] Fully visible public distribution and category/eligibility configuration.
- [ ] App Pricing plan, trial, overage event handle, and accepted/reversed App
      Events verified in the production Partner organization.

## Vendor and operations

- [ ] Signed CALL-E and Render DPA/security/subprocessor/retention/breach/transfer
      review.
- [ ] Branded production app/auth/privacy/terms/DPA/support/security/status URLs.
- [ ] Monitored support/security mailboxes, emergency email/phone, submission
      sender allowlist, P1 on-call owner, and one-business-day support process.
- [ ] Separate staging/production apps, services, databases, secrets, CALL-E
      projects, caller IDs, and controlled test numbers.
- [ ] PostgreSQL TLS/backups/PITR and successful documented restore.
- [ ] Uptime, queue, webhook, provider, billing, database, and privacy alerts.

## Regional CALL-E/legal approval

Every row requires: country legal matrix reference; permitted purpose; local
calling window; DNC/suppression rule; AI/transcription disclosure; recording and
retention decision; CALL-E production routing authorization; KYC/caller ID/line;
localization/script sign-off; effective date; and kill-switch owner.

| Region               | Legal | CALL-E production/KYC | Caller ID/line | Locale/scripts | Policy enabled | Release sign-off |
| -------------------- | ----- | --------------------- | -------------- | -------------- | -------------- | ---------------- |
| United States        | [ ]   | [ ]                   | [ ]            | [ ]            | [ ]            | [ ]              |
| Singapore            | [ ]   | [ ]                   | [ ]            | [ ]            | [ ]            | [ ]              |
| Malaysia             | [ ]   | [ ]                   | [ ]            | [ ]            | [ ]            | [ ]              |
| India                | [ ]   | [ ]                   | [ ]            | [ ]            | [ ]            | [ ]              |
| United Arab Emirates | [ ]   | [ ]                   | [ ]            | [ ]            | [ ]            | [ ]              |
| Australia            | [ ]   | [ ]                   | [ ]            | [ ]            | [ ]            | [ ]              |
| Canada               | [ ]   | [ ]                   | [ ]            | [ ]            | [ ]            | [ ]              |
| United Kingdom       | [ ]   | [ ]                   | [ ]            | [ ]            | [ ]            | [ ]              |
| Vietnam              | [ ]   | [ ]                   | [ ]            | [ ]            | [ ]            | [ ]              |
| Germany              | [ ]   | [ ]                   | [ ]            | [ ]            | [ ]            | [ ]              |
| Japan                | [ ]   | [ ]                   | [ ]            | [ ]            | [ ]            | [ ]              |
| France               | [ ]   | [ ]                   | [ ]            | [ ]            | [ ]            | [ ]              |
| Mexico               | [ ]   | [ ]                   | [ ]            | [ ]            | [ ]            | [ ]              |
| Brazil               | [ ]   | [ ]                   | [ ]            | [ ]            | [ ]            | [ ]              |
| Indonesia            | [ ]   | [ ]                   | [ ]            | [ ]            | [ ]            | [ ]              |
| Philippines          | [ ]   | [ ]                   | [ ]            | [ ]            | [ ]            | [ ]              |
| Kenya                | [ ]   | [ ]                   | [ ]            | [ ]            | [ ]            | [ ]              |
| Netherlands          | [ ]   | [ ]                   | [ ]            | [ ]            | [ ]            | [ ]              |
| Poland               | [ ]   | [ ]                   | [ ]            | [ ]            | [ ]            | [ ]              |
| Bangladesh           | [ ]   | [ ]                   | [ ]            | [ ]            | [ ]            | [ ]              |
| Nigeria              | [ ]   | [ ]                   | [ ]            | [ ]            | [ ]            | [ ]              |
| Oman                 | [ ]   | [ ]                   | [ ]            | [ ]            | [ ]            | [ ]              |
| Thailand             | [ ]   | [ ]                   | [ ]            | [ ]            | [ ]            | [ ]              |
| Namibia              | [ ]   | [ ]                   | [ ]            | [ ]            | [ ]            | [ ]              |
| Cameroon             | [ ]   | [ ]                   | [ ]            | [ ]            | [ ]            | [ ]              |
| Mozambique           | [ ]   | [ ]                   | [ ]            | [ ]            | [ ]            | [ ]              |
| Saudi Arabia         | [ ]   | [ ]                   | [ ]            | [ ]            | [ ]            | [ ]              |
| Finland              | [ ]   | [ ]                   | [ ]            | [ ]            | [ ]            | [ ]              |
