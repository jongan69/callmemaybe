# Regional release gates

All region-policy rows default disabled. A region can be enabled only when its
record contains an effective legal approval, CALL-E production approval, caller
ID/line, allowed purpose, approved locale/script set, quiet hours, AI and
transcription disclosure, suppression/DNC rule, retention decision, and kill
switch owner.

The release scope is all 28 regions at once, so one missing row blocks the public
launch. Demo-only values are not approvals.

`timezoneStrategy` must remain `disabled` until legal review records either an
approved `fixed:<IANA zone>` strategy for a single-zone policy or a
`conservative:<IANA zone>` window demonstrated to remain inside permitted local
hours for every recipient covered by that policy. Merchant or client timezone
input is never used to bypass quiet hours.

Evidence is tracked in
[`submission/EXTERNAL_APPROVALS.md`](../submission/EXTERNAL_APPROVALS.md). Any
change in law, provider routing, caller ID, retention, purpose, script, or
subprocessor requires a new policy version and approval before re-enable.
