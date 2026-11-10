# Rule reviews — blastjax

The owner's verdicts on the business rules that need a person's judgement (P0 rules with a suspected defect, an owner question or less than High confidence). 37 reviewed: 35 confirmed, 2 wrong or not wanted, 0 need discussion. "Confirmed" means the rule describes the code correctly and the behavior is wanted as it is today, including any suspected defect noted on its card.

| Rule | Verdict | When | Title | Note |
|---|---|---|---|---|
| RULE-002 | confirmed | 2026-11-09T07:20:42+00:00 | Login is off until the first user exists |  |
| RULE-003 | wrong | 2026-11-09T15:42:49+00:00 | User admin has no server-side authorization | Owner applies SEC-002 (whole patch, 2026-11-09): user admin will require Settings access. New behavior = patch hunk + check_settings_access. |
| RULE-004 | confirmed | 2026-11-09T07:20:42+00:00 | Page restrictions are enforced only in the browser |  |
| RULE-005 | wrong | 2026-11-09T15:42:49+00:00 | Deleting the last user turns login off | Owner applies SEC-003 (whole patch, 2026-11-09): deleting the last user will be refused (409). New behavior = patch hunk + check_settings_access. |
| RULE-006 | confirmed | 2026-11-09T07:20:42+00:00 | Login lockout after 8 failures per address |  |
| RULE-007 | confirmed | 2026-11-09T07:20:42+00:00 | The password-check endpoint is not throttled |  |
| RULE-008 | confirmed | 2026-11-09T07:20:42+00:00 | Sessions never expire and survive password changes |  |
| RULE-009 | confirmed | 2026-11-09T07:20:42+00:00 | Passkey login: own origin, one-use 5-minute challenge |  |
| RULE-010 | confirmed | 2026-11-09T08:13:53+00:00 | Deleting a bill category deletes its bills |  |
| RULE-011 | confirmed | 2026-11-09T08:13:53+00:00 | Deleting a card drops payments, keeps budget lines |  |
| RULE-013 | confirmed | 2026-11-09T08:13:53+00:00 | Upload size and type limits |  |
| RULE-014 | confirmed | 2026-11-09T08:13:53+00:00 | A company in use can't be deleted (by name only) |  |
| RULE-016 | confirmed | 2026-11-09T08:13:53+00:00 | Pay-period start overrides stay within bounds |  |
| RULE-017 | confirmed | 2026-11-09T08:13:53+00:00 | Credit card setup limits |  |
| RULE-018 | confirmed | 2026-11-09T08:13:53+00:00 | Card payments are positive and filed to a pay period |  |
| RULE-019 | confirmed | 2026-11-09T08:13:53+00:00 | Moving budget between days is checked only in the browser |  |
| RULE-021 | confirmed | 2026-11-09T08:13:53+00:00 | Monthly expense amounts, periods and month keys |  |
| RULE-022 | confirmed | 2026-11-09T08:13:53+00:00 | Bill period order and minimum-due ceiling |  |
| RULE-023 | confirmed | 2026-11-09T08:13:53+00:00 | Installment counts and remaining balance |  |
| RULE-024 | confirmed | 2026-11-09T08:13:53+00:00 | Installment payment only while one is owed |  |
| RULE-026 | confirmed | 2026-11-09T09:22:57+00:00 | Pay-period boundaries follow payday |  |
| RULE-027 | confirmed | 2026-11-09T09:22:57+00:00 | Daily budget from the funding payslip |  |
| RULE-029 | confirmed | 2026-11-09T09:22:57+00:00 | Off-budget months: charged to a card or skipped |  |
| RULE-030 | confirmed | 2026-11-09T09:22:57+00:00 | Off-calendar changes spread over pinned days; shortfall banked |  |
| RULE-034 | confirmed | 2026-11-09T09:22:57+00:00 | A period's savings carry over to the next |  |
| RULE-035 | confirmed | 2026-11-09T09:22:57+00:00 | Calendar fixed entries rebalance the period's days |  |
| RULE-036 | confirmed | 2026-11-09T09:22:57+00:00 | Installment line totals and plan aggregates |  |
| RULE-037 | confirmed | 2026-11-09T09:22:57+00:00 | Installment due this month and monthly total |  |
| RULE-039 | confirmed | 2026-11-09T09:22:57+00:00 | Card dues this month |  |
| RULE-048 | confirmed | 2026-11-09T09:22:57+00:00 | Calendar edits of a card-payment line don't touch the payment |  |
| RULE-049 | confirmed | 2026-11-09T09:22:57+00:00 | "Paid" on a monthly expense logs or deletes a house-payment entry |  |
| RULE-050 | confirmed | 2026-11-09T09:22:57+00:00 | Changing an installment's count resets its schedule |  |
| RULE-051 | confirmed | 2026-11-09T09:24:15+00:00 | A covering card payment auto-advances installments, never undone |  |
| RULE-052 | confirmed | 2026-11-09T09:24:15+00:00 | A typed statement resets the balance; linked cards never reset |  |
| RULE-053 | confirmed | 2026-11-09T09:24:15+00:00 | A write clears its cache namespaces and linked ones |  |
| RULE-054 | confirmed | 2026-11-09T09:24:15+00:00 | Deploy order: tests, migration, flush, schema sync, start |  |
| RULE-055 | confirmed | 2026-11-09T09:24:15+00:00 | API start syncs schema, seeds games, wipes the cache |  |
