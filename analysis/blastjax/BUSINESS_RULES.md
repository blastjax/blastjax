# Business rules — blastjax

Date: 2026-11-09 · Source: repository root at `d5d57f5` · Method B (no Workflow tool): three business-rules-extractor
agents (calculations; validations and eligibility; state and lifecycle) returned 75 candidates. Overlapping cards were
merged into one rule per behavior (18 merges), leaving **57 rules**. Every `Source` range below was re-checked by the
orchestrator: the file exists, the range is in bounds, and it opens on the function or block the rule describes. No rule
rests on a comment or string alone. No instruction-shaped text or credential was found in the scanned source.

Paths are relative to the repository root (the docs' `legacy/blastjax`).

## Summary

| ID | Name | Category | Priority | Source | Confidence |
|---|---|---|---|---|---|
| RULE-001 | Every data API requires a valid session | Policy | P0 | `backend/app/deps.py:17-23` | High |
| RULE-002 | Login is off until the first user exists | Policy | P0 | `backend/app/security.py:76-94` | High |
| RULE-003 | User admin has no server-side authorization | Policy | P0 | `backend/app/routers/user.py:66-71` | High |
| RULE-004 | Page restrictions are enforced only in the browser | Policy | P0 | `web/src/lib/nav.ts:205-209` | High |
| RULE-005 | Deleting the last user turns login off | Policy | P0 | `backend/app/routers/user.py:74-78` | High |
| RULE-006 | Login lockout after 8 failures per address | Policy | P0 | `backend/app/routers/auth.py:93-105` | Medium |
| RULE-007 | The password-check endpoint is not throttled | Policy | P0 | `backend/app/routers/user.py:46-50` | High |
| RULE-008 | Sessions never expire and survive password changes | Policy | P0 | `backend/app/security.py:107-126` | Medium |
| RULE-009 | Passkey login: own origin, one-use 5-minute challenge | Policy | P0 | `backend/app/routers/auth.py:116-146` | High |
| RULE-010 | Deleting a bill category deletes its bills | Policy | P0 | `backend/schema.py:102-107` | Medium |
| RULE-011 | Deleting a card drops payments, keeps budget lines | Policy | P0 | `backend/schema.py:144-185` | High |
| RULE-012 | User fields and case-insensitive unique usernames | Validation | P0 | `backend/app/schemas/user.py:6-27` | High |
| RULE-013 | Upload size and type limits | Validation | P0 | `backend/app/deps.py:30-43` | High |
| RULE-014 | A company in use can't be deleted (by name only) | Validation | P0 | `backend/db.py:1913-1932` | Medium |
| RULE-015 | Company names unique; reorder lists every company | Validation | P1 | `backend/app/routers/company.py:35-52` | High |
| RULE-016 | Pay-period start overrides stay within bounds | Validation | P0 | `backend/app/routers/pay_period_start_override.py:46-89` | Medium |
| RULE-017 | Credit card setup limits | Validation | P0 | `backend/app/schemas/credit_card.py:9-19` | High |
| RULE-018 | Card payments are positive and filed to a pay period | Validation | P0 | `backend/app/schemas/credit_card.py:22-29` | High |
| RULE-019 | Moving budget between days is checked only in the browser | Validation | P0 | `web/src/app/calendar/CalendarClient.tsx:943-1009` | Medium |
| RULE-020 | Fixed entries are non-zero; negative means income | Validation | P0 | `backend/app/schemas/fixed_expense.py:6-21` | High |
| RULE-021 | Monthly expense amounts, periods and month keys | Validation | P0 | `backend/app/schemas/monthly_expense.py:9-33` | High |
| RULE-022 | Bill period order and minimum-due ceiling | Validation | P0 | `backend/app/schemas/bill.py:41-56` | High |
| RULE-023 | Installment counts and remaining balance | Validation | P0 | `backend/app/routers/installment.py:42-63` | High |
| RULE-024 | Installment payment only while one is owed | Validation | P0 | `backend/db.py:696-728` | Medium |
| RULE-025 | Payslip period ranges and company name | Validation | P1 | `backend/app/schemas/payslip.py:6-34` | Medium |
| RULE-026 | Pay-period boundaries follow payday | Calculation | P0 | `web/src/lib/payPeriods.ts:59-101` | Medium |
| RULE-027 | Daily budget from the funding payslip | Calculation | P0 | `web/src/lib/payPeriods.ts:303-350` | Medium |
| RULE-028 | Where a monthly expense lands; a real bill replaces the estimate | Calculation | P0 | `web/src/lib/payPeriods.ts:103-148` | High |
| RULE-029 | Off-budget months: charged to a card or skipped | Calculation | P0 | `web/src/lib/payPeriods.ts:23-38` | Medium |
| RULE-030 | Off-calendar changes spread over pinned days; shortfall banked | Calculation | P0 | `web/src/lib/payPeriods.ts:205-238` | High |
| RULE-031 | Budget deltas when expenses or bills change | Calculation | P0 | `web/src/lib/payPeriods.ts:271-301` | High |
| RULE-032 | Cent-exact even split with no negative days | Calculation | P0 | `web/src/lib/payPeriods.ts:155-199` | High |
| RULE-033 | Recording a day's spend | Calculation | P0 | `web/src/app/calendar/CalendarClient.tsx:1122-1156` | High |
| RULE-034 | A period's savings carry over to the next | Calculation | P0 | `web/src/app/calendar/CalendarClient.tsx:1076-1120` | Medium |
| RULE-035 | Calendar fixed entries rebalance the period's days | Calculation | P0 | `web/src/app/calendar/CalendarClient.tsx:1049-1072` | Medium |
| RULE-036 | Installment line totals and plan aggregates | Calculation | P0 | `backend/db.py:498-564` | High |
| RULE-037 | Installment due this month and monthly total | Calculation | P0 | `backend/app/services/installment_service.py:24-96` | High |
| RULE-038 | Statement counts as paid only when fully covered | Calculation | P0 | `backend/app/routers/credit_card.py:71-76` | High |
| RULE-039 | Card dues this month | Calculation | P0 | `backend/app/routers/credit_card.py:63-68` | Medium |
| RULE-040 | Linked card's statement comes from its latest bill | Calculation | P0 | `backend/db.py:1094-1112` | High |
| RULE-041 | Reading a payslip PDF into pay fields | Calculation | P1 | `backend/app/services/payslip_parse.py:184-221` | High |
| RULE-042 | "Even out" a period's remaining budget | Calculation | P1 | `web/src/app/calendar/CalendarClient.tsx:1182-1205` | High |
| RULE-043 | Payslip gross and deduction totals | Calculation | P1 | `web/src/app/payslip/payslipAggregates.ts:65-118` | Medium |
| RULE-044 | Remaining travel price | Calculation | P2 | `web/src/lib/remainingPrice.ts:16-25` | High |
| RULE-045 | A card payment lowers the balance and books a budget expense | Lifecycle | P0 | `backend/db.py:1215-1240` | High |
| RULE-046 | Editing a payment rebalances card and budget | Lifecycle | P0 | `backend/db.py:1243-1278` | High |
| RULE-047 | Deleting a payment restores card and budget | Lifecycle | P0 | `backend/db.py:1281-1297` | High |
| RULE-048 | Calendar edits of a card-payment line don't touch the payment | Lifecycle | P0 | `backend/db.py:924-937` | Medium |
| RULE-049 | "Paid" on a monthly expense logs or deletes a house-payment entry | Lifecycle | P0 | `web/src/app/monthly-expenses/MonthlyExpensesClient.tsx:299-313` | Medium |
| RULE-050 | Changing an installment's count resets its schedule | Lifecycle | P0 | `backend/db.py:638-688` | Medium |
| RULE-051 | A covering card payment auto-advances installments, never undone | Lifecycle | P0 | `web/src/app/credit-card/CreditCardClient.tsx:799-819` | High |
| RULE-052 | A typed statement resets the balance; linked cards never reset | Lifecycle | P0 | `backend/db.py:1134-1168` | Medium |
| RULE-053 | A write clears its cache namespaces and linked ones | Lifecycle | P0 | `backend/app/factory.py:30-118` | Medium |
| RULE-054 | Deploy order: tests, migration, flush, schema sync, start | Lifecycle | P0 | `.github/workflows/deploy.yml:117-126` | High |
| RULE-055 | API start syncs schema, seeds games, wipes the cache | Lifecycle | P0 | `backend/app/factory.py:80-90` | High |
| RULE-056 | Schema changes are additive only | Lifecycle | P0 | `backend/schema.py:661-678` | High |
| RULE-057 | PCSO sync: resume, reuse, back off, fill only missing | Lifecycle | P1 | `backend/app/services/pcso_results.py:106-135` | High |

Counts: Policy 11, Validation 14, Calculation 19, Lifecycle 13 · P0 50, P1 6, P2 1 · High 37, Medium 20.

## Policy

### RULE-001: Every data API requires a valid session
**Category:** Policy
**Priority:** P0
**Source:** `backend/app/deps.py:17-23`
**Plain English:** When login is on, every data endpoint refuses a request without a valid session token.
**Specification:**
  Given at least one user exists and a request to `GET /api/credit-card` carries no or an unknown bearer token
  When  it reaches a router mounted with `require_session` (all but `/api/health` and `/api/auth/*`, `factory.py:143-166`)
  Then  401 "Login required."; a valid token passes; with login off the check is skipped
**Parameters:** header prefix `bearer ` (case-insensitive); token = header[7:]
**Edge cases handled:** missing header → empty token → 401; health and auth routes are deliberately outside the gate
**Confidence:** High — explicit dependency on every non-auth router.

### RULE-002: Login is off until the first user exists
**Category:** Policy
**Priority:** P0
**Source:** `backend/app/security.py:76-94`
**Plain English:** The app runs fully open while there are no users, or whenever `BUDGET_DISABLE_AUTH` is set; adding the first user turns login on, and deleting the last turns it off.
**Specification:**
  Given `app_user` is empty and `BUDGET_DISABLE_AUTH` is unset
  When  anyone calls `POST /api/users` or `GET /api/payslip` with no token
  Then  the request succeeds; after the first user exists every gated call needs a session (RULE-001)
**Parameters:** `BUDGET_DISABLE_AUTH` in {1, true, yes}; "users exist" cached 5 s per process and 3600 s in Redis, cleared on any successful `/api/users` write
**Edge cases handled:** the writing process sees the change at once; other workers may lag up to 5 s
**Suspected defect:** a fresh or emptied database exposes all financial data and user creation to anyone who can reach the API; the switch is an unaudited production bypass.
**Confidence:** High — explicit code. SME question: "Is running open while no users exist acceptable on the internet-facing deployment, and should `BUDGET_DISABLE_AUTH` be honored in production?"

### RULE-003: User admin has no server-side authorization
**Category:** Policy
**Priority:** P0
**Source:** `backend/app/routers/user.py:66-71`
**Plain English:** Any session holder can create, rename, re-password or delete any user and set anyone's superuser flag and page list.
**Specification:**
  Given user "guest" with `is_superuser=false`, `allowed_pages=["/travels"]` is logged in
  When  guest sends `PUT /api/users/<own id>/access {"is_superuser": true, "allowed_pages": null}`
  Then  the change is saved and returned; only an unknown id gets 404
**Parameters:** the users router depends only on `require_db` plus the global `require_session`
**Edge cases handled:** 404 for unknown id; `allowed_pages` strings are not checked against the page list
**Suspected defect:** privilege escalation; superuser is enforced only in the browser (SEC-002; `security_remediation.patch` adds a Settings check).
**Confidence:** High — no server-side read of `is_superuser` besides echoing it in `/api/auth/status`.

### RULE-004: Page restrictions are enforced only in the browser
**Category:** Policy
**Priority:** P0
**Source:** `web/src/lib/nav.ts:205-209`
**Plain English:** A restricted user only sees the areas in their allowed pages, but that is a UI redirect; the matching APIs stay open to them.
**Specification:**
  Given user "guest" with `allowed_pages=["/travels"]`
  When  guest opens `/credit-card`, then calls `GET /api/credit-card` with the same token
  Then  the page redirects to `/` and renders nothing, but the API returns every card
**Parameters:** no user, a superuser, or `allowedPages === null` → all pages; payslip, commission and salary-stats share the `/payslip` key; a path with no top-level match is always allowed
**Edge cases handled:** child pages map to their parent; new users default to `allowed_pages = NULL` (everything)
**Suspected defect:** a browser-only authorization rule; any restricted user can read and change all data through the API.
**Confidence:** High — explicit. SME question: "Are page restrictions meant as a security boundary, or only to tidy the UI?"

### RULE-005: Deleting the last user turns login off
**Category:** Policy
**Priority:** P0
**Source:** `backend/app/routers/user.py:74-78`
**Plain English:** Any user can be deleted, including yourself or the last account; with none left the whole app is open.
**Specification:**
  Given exactly one user "owner" exists and is logged in
  When  owner sends `DELETE /api/users/<owner id>`
  Then  200 `{"ok": true}`; passkeys and sessions cascade-delete; `login_required()` becomes false and every API is open (RULE-002)
**Parameters:** none; unknown id → 404 "User not found."
**Edge cases handled:** the browser asks for confirmation first; no self-delete or last-superuser check
**Suspected defect:** one click fully disables authentication (SEC-003; the patch refuses deleting the last user).
**Confidence:** High — explicit. SME question: "Should deleting the last user, or the last superuser, be refused?"

### RULE-006: Login lockout after 8 failures per address
**Category:** Policy
**Priority:** P0
**Source:** `backend/app/routers/auth.py:93-105`
**Plain English:** After 8 failed logins from one address, logins from it are refused until 15 minutes pass with no new failure; a success clears the count.
**Specification:**
  Given 8 failed password or passkey logins from 203.0.113.7, the last one 3 minutes ago
  When  a 9th `POST /api/auth/login` arrives from it with the correct password
  Then  429 "Too many attempts. Try again later."; below 8, a wrong password gives 401 and counts, a right one returns a token and clears the count
**Parameters:** `_MAX_FAILED_ATTEMPTS` 8, `_FAIL_WINDOW_SECONDS` 900 (TTL reset on each failure); username 1–100, password 1–200 chars
**Edge cases handled:** username trimmed and matched case-insensitively; the same message for unknown user and wrong password; passkey failures share the counter; without Redis a per-process store is used
**Suspected defect:** the key is `request.client.host`; behind Caddy every user shares the proxy's address, so 8 bad attempts by anyone lock everyone out (SEC-005).
**Confidence:** Medium — explicit code; deployment-dependent. SME question: "Is uvicorn configured to trust X-Forwarded-For from the edge proxy in production?"

### RULE-007: The password-check endpoint is not throttled
**Category:** Policy
**Priority:** P0
**Source:** `backend/app/routers/user.py:46-50`
**Plain English:** `POST /api/users/verify` says whether a username and password match, without the login lockout.
**Specification:**
  Given a logged-in session and target user "owner"
  When  the caller sends 1,000 verify requests with different passwords
  Then  each returns `{"valid": false|true}`; no failure is recorded and no 429 is returned
**Parameters:** username 1–100, password 1–200
**Edge cases handled:** username trimmed and case-insensitive
**Suspected defect:** a password-guessing oracle that bypasses RULE-006 (SEC-009).
**Confidence:** High — explicit. SME question: "Is this check-password tool needed, and should it share the login throttle or be admin-only?"

### RULE-008: Sessions never expire and survive password changes
**Category:** Policy
**Priority:** P0
**Source:** `backend/app/security.py:107-126`
**Plain English:** A login token stays valid until that token logs out; changing a password does not end other sessions, and a deleted user's token can pass for up to 5 minutes from the cache.
**Specification:**
  Given "owner" logged in on 2026-01-05 and never logged out, and the password was changed on 2026-06-01
  When  the same token is presented on 2026-11-09
  Then  it is accepted; after `POST /api/auth/logout` the row and cache key are deleted and the next call gets 401
**Parameters:** token = 32 random bytes, URL-safe; only SHA-256 stored; positive lookups cached 300 s
**Edge cases handled:** logout with an empty or unknown token returns ok; user delete cascades sessions in the database
**Suspected defect:** no idle or absolute timeout; no revocation on password change; during the 300 s window `/api/auth/status` can report authenticated with `user=null`, which `nav.ts` treats as full access (SEC-006).
**Confidence:** Medium — mechanics explicit. SME question: "What session lifetime is acceptable, and should password changes and user deletion revoke all sessions at once?"

### RULE-009: Passkey login: own origin, one-use 5-minute challenge
**Category:** Policy
**Priority:** P0
**Source:** `backend/app/routers/auth.py:116-146`
**Plain English:** A passkey login works only from the app's own address, with a challenge this server issued in the last 5 minutes, used once, from a registered passkey with user verification.
**Specification:**
  Given a challenge issued at 10:00:00 and a passkey registered to "owner"
  When  the signed response arrives at 10:06:00, or replays a used challenge, or comes from a foreign Origin
  Then  401 (and a failure is counted) for an expired or replayed challenge; 400 "Passkeys only work from the app's own web address." for a bad origin; success updates sign count and last-used time and returns a session token
**Parameters:** challenge TTL 300 s; user verification and resident key required; allowed origins = localhost:3000, 127.0.0.1:3000 plus `BUDGET_CORS_ORIGINS`
**Edge cases handled:** lockout applies before verification; registration needs a session and is bound to that user; duplicate credential → 409
**Suspected defect:** challenge redemption is get-then-delete, not atomic, so two racing requests could spend one challenge (acknowledged in a comment, SEC-016).
**Confidence:** High — explicit code.

### RULE-010: Deleting a bill category deletes its bills
**Category:** Policy
**Priority:** P0
**Source:** `backend/schema.py:102-107`
**Plain English:** Removing a bill category is never blocked; every bill and attached file in it is deleted, and linked cards and monthly expenses are unlinked.
**Specification:**
  Given category "Meralco" with 14 bills, a linked card and a linked monthly expense
  When  `DELETE /api/bill-category/<id>`
  Then  200; the 14 bills are deleted (FK CASCADE); the card's and expense's `bill_category_id` become NULL
**Parameters:** category name unique case-insensitively (409 "That category already exists.")
**Edge cases handled:** card and monthly-expense caches are cleared on bill writes
**Suspected defect:** inconsistent with the company guard (RULE-014): financial history and documents are lost without an in-use check.
**Confidence:** Medium — the cascade is explicit; whether it is intended is not. SME question: "Should a category that still has bills or linked cards be refused, like companies?"

### RULE-011: Deleting a card drops payments, keeps budget lines
**Category:** Policy
**Priority:** P0
**Source:** `backend/schema.py:144-185`
**Plain English:** Removing a card deletes its payment history but keeps the budget expenses those payments created (that money did leave the budget); installments and the bill link are only unlinked.
**Specification:**
  Given card X with 3 payments (each mirrored as a fixed expense) and 2 linked installments
  When  `DELETE /api/credit-card/<X>`
  Then  the 3 payments are deleted (CASCADE), the 3 fixed expenses remain with `credit_card_payment_id = NULL`, the installments get `credit_card_id = NULL`
**Parameters:** payment→card CASCADE; fixed_expense→payment SET NULL; installment→card SET NULL; card→bill_category SET NULL
**Edge cases handled:** installment and fixed-expense caches are cleared on card writes
**Suspected defect:** monthly expenses' `charged_months` keeps pointing at the deleted card (no FK) and the monthly-expense cache is not cleared, so those expenses stay off the budget and vanish from the card page (RULE-029).
**Confidence:** High — explicit FK actions.

## Validation

### RULE-012: User fields and case-insensitive unique usernames
**Category:** Validation
**Priority:** P0
**Source:** `backend/app/schemas/user.py:6-27`
**Plain English:** A user needs a non-blank username up to 100 characters, unique regardless of case, and a password of 8 to 200 characters.
**Specification:**
  Given user "Alice" exists
  When  `POST /api/users {"username": "alice", "password": "s3cretpass"}`
  Then  409 "That username is already taken."; a 7-character password or a blank username gives 422; success returns the user without the hash
**Parameters:** username 1–100 (trimmed); password 8–200; Argon2 hash; DB check `length(trim(username)) > 0`; unique index on `lower(username)`
**Edge cases handled:** an update needs a username and/or password; unknown id → 404; the browser applies the same minimum and a confirm match
**Confidence:** High — explicit schema and index.

### RULE-013: Upload size and type limits
**Category:** Validation
**Priority:** P0
**Source:** `backend/app/deps.py:30-43`
**Plain English:** Payslip and bill files are refused if empty, over 10 MB, or not a PDF; bill uploads also accept PNG or JPEG photos.
**Specification:**
  Given a payslip PDF of 10,485,761 bytes
  When  it is uploaded
  Then  413 "The file exceeds the 10 MB limit."; 0 bytes → 400 "Uploaded file is empty."; a non-PDF → 400; exactly 10,485,760 bytes is accepted
**Parameters:** 10 × 1024 × 1024 bytes; PDF = content type `application/pdf`/`x-pdf` or bytes starting `%PDF`; PNG and JPEG by magic bytes when `images=True`
**Edge cases handled:** image type comes from bytes, not the declared type
**Suspected defect:** a declared PDF content type alone is enough, so any bytes are stored and later served as PDF; the whole file is read before the size check (SEC-014).
**Confidence:** High — explicit code.

### RULE-014: A company in use can't be deleted (by name only)
**Category:** Validation
**Priority:** P0
**Source:** `backend/db.py:1913-1932`
**Plain English:** Deleting a company is refused while any payslip carries exactly its name; renaming a company changes only the company row.
**Specification:**
  Given company "Sophos" and 48 payslips with company "Sophos"
  When  `DELETE /api/companies/<id>`
  Then  409 'Cannot delete "Sophos": 48 payslip(s) still use it.'; if it is first renamed "Sophos PH", the delete passes and the 48 payslips are orphaned
**Parameters:** exact, case-sensitive `payslip.company == company.name`
**Edge cases handled:** missing company → 404
**Suspected defect:** payslips and payslip defaults reference the company by free-text name with no FK, so a rename silently orphans them and defeats the guard; a case difference also escapes it.
**Confidence:** Medium — explicit code; intent unclear. SME question: "Should renaming a company carry its payslips and defaults with it, and should the guard ignore letter case?"

### RULE-015: Company names unique; reorder lists every company
**Category:** Validation
**Priority:** P1
**Source:** `backend/app/routers/company.py:35-52`
**Plain English:** A company needs a non-blank name up to 100 characters, unique regardless of case, and a reorder must list every company exactly once.
**Specification:**
  Given company "Sophos" exists
  When  `POST /api/companies {"name": " SOPHOS "}`, or a reorder that omits one id
  Then  409 "That company already exists."; 400 "ids must list every company id exactly once."
**Parameters:** name 1–100, trimmed; unique index on `lower(name)`; column flags default true except bereavement
**Edge cases handled:** rename to an existing name → 409; duplicate ids in a reorder refused
**Confidence:** High — explicit.

### RULE-016: Pay-period start overrides stay within bounds
**Category:** Validation
**Priority:** P0
**Source:** `backend/app/routers/pay_period_start_override.py:46-89`
**Plain English:** A first-half period may start on or before the 1st but after the previous second-half start; a second-half period may start from the 2nd to the 16th.
**Specification:**
  Given March 2026 half 1, with February half 2 at its default 16th
  When  start dates 2026-02-26, 2026-03-02 and 2026-02-16 are submitted
  Then  02-26 is saved; 03-02 → 400 "Start date can't be later than 2026-03-01."; 02-16 → 400 (must be after the previous period's start)
**Parameters:** half-1 ceiling = 1st; half-1 floor = previous half-2 start (default 16th) + 1 day; half-2 window = 2nd–16th; one row per (year, month, half)
**Edge cases handled:** non-ISO date → 400; January looks back to December; delete of nothing returns `{"ok": false}`
**Suspected defect:** the server assumes default starts of the 1st and 16th, while the calendar's defaults follow payday (RULE-026), so some valid overrides are refused; a half-2 change is not re-checked against the next month's half-1 override (periods can overlap); an out-of-range year gives 500.
**Confidence:** Medium — explicit code. SME question: "Should the server's bounds use the same payday-based defaults as the calendar, and check the following month's start?"

### RULE-017: Credit card setup limits
**Category:** Validation
**Priority:** P0
**Source:** `backend/app/schemas/credit_card.py:9-19`
**Plain English:** A card needs a name, a credit limit above zero, a minimum due and monthly interest of zero or more; the statement balance may be negative (a credit).
**Specification:**
  Given a new card with credit limit 0
  When  `POST /api/credit-card`
  Then  422; with limit 50,000.00 and statement −1,200.00 it is saved and the balance starts at −1,200.00; an unknown bill category → 404
**Parameters:** `credit_limit > 0`; `minimum_due ≥ 0`; `interest_rate ≥ 0` (monthly %, default 3.5)
**Edge cases handled:** the browser also requires a non-blank name and skips statement checks for bill-linked cards
**Suspected defect:** a name of spaces passes the server (length checked before trimming) and is stored blank; same for installment, house-payment and monthly-expense names. No upper bound on interest; minimum due not checked against the balance.
**Confidence:** High — explicit.

### RULE-018: Card payments are positive and filed to a pay period
**Category:** Validation
**Priority:** P0
**Source:** `backend/app/schemas/credit_card.py:22-29`
**Plain English:** A card payment must be more than zero and name the pay period (year, month, half) whose budget it comes out of.
**Specification:**
  Given card "BPI" with balance 25,000.00
  When  a 5,000 payment dated 2026-11-20 for 2026-11 half 2 is posted
  Then  saved (RULE-045); amount 0 or half 3 → 422; unknown card → 404
**Parameters:** amount > 0; half 1–2; month 1–12; year unbounded
**Edge cases handled:** a payment larger than the balance is allowed
**Suspected defect:** the server never checks that the period matches the payment date (the browser derives it); the year has no range.
**Confidence:** High — explicit.

### RULE-019: Moving budget between days is checked only in the browser
**Category:** Validation
**Priority:** P0
**Source:** `web/src/app/calendar/CalendarClient.tsx:943-1009`
**Plain English:** The calendar lets you move daily budget only within one pay period, for an amount above zero and at most the source day's budget; the server enforces none of this.
**Specification:**
  Given Nov 3 has 500.00 and Nov 5 has 300.00 in the same period
  When  200.00 is dragged from Nov 3 to Nov 5
  Then  one bulk call saves Nov 3 = 300.00, Nov 5 = 500.00; across periods, 0, or more than 500.00 are refused in the browser
**Parameters:** server checks only amount ≥ 0 per day and 1–100 rows per call
**Edge cases handled:** browser rounds to cents and floors the source at 0
**Suspected defect:** a direct API call can raise a period's total or move money across periods; a malformed `day` gives 500, not 422.
**Confidence:** Medium — explicit. SME question: "Must a pay period's daily amounts always add up to its budget, and should the server enforce it?"

### RULE-020: Fixed entries are non-zero; negative means income
**Category:** Validation
**Priority:** P0
**Source:** `backend/app/schemas/fixed_expense.py:6-21`
**Plain English:** A one-off budget entry needs a non-zero amount (positive = expense, negative = extra income) and a valid half and month.
**Specification:**
  Given November 2026 half 1
  When  an entry of 0, then −2,500.00, then half 3 is posted
  Then  422 "amount must not be zero"; −2,500.00 is saved as income; half 3 → 422
**Parameters:** amount ≠ 0; half 1–2; month 1–12
**Edge cases handled:** description trimmed, blank → null; an edit changes only amount and description; unknown id → 404
**Confidence:** High — explicit. (Its interaction with card payments is RULE-048.)

### RULE-021: Monthly expense amounts, periods and month keys
**Category:** Validation
**Priority:** P0
**Source:** `backend/app/schemas/monthly_expense.py:9-33`
**Plain English:** A monthly expense needs a name, an amount above zero, a half and month, and skipped or card-charged months written as "YYYY-MM".
**Specification:**
  Given "Internet" 1,699.00, half 1
  When  saved with `charged_months {"2026-13": null}`, or amount 0
  Then  422; valid skipped months are stored de-duplicated and sorted; an unknown linked category or house payment → 404
**Parameters:** amount > 0; half 1–2; month 1–12; month key `^\d{4}-(0[1-9]|1[0-2])$`
**Edge cases handled:** deleting a linked category or house payment unlinks it (SET NULL)
**Suspected defect:** `charged_months` card ids are checked only as UUID format, not that the card exists; a blank name passes the server.
**Confidence:** High — explicit.

### RULE-022: Bill period order and minimum-due ceiling
**Category:** Validation
**Priority:** P0
**Source:** `backend/app/schemas/bill.py:41-56`
**Plain English:** A bill's period can't end before it starts, and its minimum due can't be negative or more than the amount (a credit balance allows no minimum).
**Specification:**
  Given a bill of 3,250.00
  When  saved with minimum due 3,500.00, or a period ending before it starts
  Then  422 "The minimum amount due can't be more than the amount." / "The billing period can't end before it starts."
**Parameters:** `minimum_due ≥ 0`; `minimum_due ≤ max(amount, 0)`; DB check `period_end ≥ period_start`
**Edge cases handled:** null amount or minimum skips the ceiling; unknown category → 404
**Suspected defect:** no check that the due date is on or after the bill date.
**Confidence:** High — explicit.

### RULE-023: Installment counts and remaining balance
**Category:** Validation
**Priority:** P0
**Source:** `backend/app/routers/installment.py:42-63`
**Plain English:** The current installment can't exceed the total plus one (fully paid), amounts can't be negative, and the remaining balance can't be negative.
**Specification:**
  Given a 12-month plan, principal 2,400.00, interest 100.00
  When  saved with current 14, or remaining −1
  Then  400 "installment_current cannot exceed installment_total + 1." / "remaining cannot be negative."; with current 4, 12 lines of 2,500.00 are seeded and remaining = 9 × 2,500.00 = 22,500.00
**Parameters:** current ≥ 1, total ≥ 1, principal ≥ 0, interest ≥ 0 or null, original total > 0 if given
**Edge cases handled:** current = total + 1 allowed; remaining and original total are recomputed from lines after save
**Suspected defect:** finish date ≥ start date not checked; an unknown card id raises an uncaught IntegrityError (500, not 404); blank names stored.
**Confidence:** High — explicit.

### RULE-024: Installment payment only while one is owed
**Category:** Validation
**Priority:** P0
**Source:** `backend/db.py:696-728`
**Plain English:** Paying an installment moves it on one step and recomputes the remaining balance; payments are refused once it is complete or nothing remains.
**Specification:**
  Given current 12 of 12, remaining 2,500.00
  When  `POST /api/installment/<id>/pay`, twice
  Then  current 13, remaining 0.00; the second call → 400 "Cannot record payment (not found, already complete, or no balance)."
**Parameters:** eligible when current ≤ total and remaining > 0; with lines, remaining = Σ line payments from the new current; without lines, max(0, remaining − payment)
**Edge cases handled:** header amounts follow the new current line; an unknown id also gives 400 (not 404)
**Confidence:** Medium — mechanics explicit. SME question: "'Due this month' uses the server's `date.today()`, probably UTC; should the month roll over at Philippine midnight?"

### RULE-025: Payslip period ranges and company name
**Category:** Validation
**Priority:** P1
**Source:** `backend/app/schemas/payslip.py:6-34`
**Plain English:** A payslip needs a non-blank company name up to 100 characters; year, month and half are optional but must be in range when given.
**Specification:**
  Given a payslip with year 1899, or company "   ", or company "Acme" not in the company list
  When  `POST /api/payslip`
  Then  422 / 422 "Company cannot be blank." / accepted
**Parameters:** company 1–100, trimmed; year 1900–2200; month 1–12; half 1–2; DB default company "Sophos"
**Edge cases handled:** JSON import skips out-of-range years and unknown months, and returns 400 if no rows result
**Suspected defect:** company not checked against the company table; no uniqueness per company and period, so duplicate payslips are accepted.
**Confidence:** Medium — explicit. SME question: "Should one payslip per company and period be enforced?"

## Calculation

### RULE-026: Pay-period boundaries follow payday
**Category:** Calculation
**Priority:** P0
**Source:** `web/src/lib/payPeriods.ts:59-101`
**Plain English:** Each month has two pay periods. The first starts on the payday before the previous month's last day, the second on the payday before the 15th; a Saturday, Sunday or Monday reference moves back to Thursday. A period ends the day before the next starts, and a manual override replaces the default.
**Specification:**
  Given no overrides, Oct 31 2026 a Saturday, Nov 15 a Sunday, Nov 30 a Monday
  When  November 2026's periods are computed
  Then  half 1 = Oct 29–Nov 11, half 2 = Nov 12–25, December half 1 starts Nov 26; a date of Oct 30 belongs to November half 1
**Parameters:** `DAYS_BACK_BY_WEEKDAY = [3,4,1,1,1,1,2]` (Sun..Sat)
**Edge cases handled:** leap years; year rollover; per-period overrides; a date at or after next month's half-1 start belongs to the next month
**Suspected defect:** the server's override bounds (RULE-016) assume the 1st/16th instead of these payday defaults.
**Confidence:** Medium — explicit. SME question: "Should the server-side override bounds use the same payday defaults as the calendar?"

### RULE-027: Daily budget from the funding payslip
**Category:** Calculation
**Priority:** P0
**Source:** `web/src/lib/payPeriods.ts:303-350`
**Plain English:** A pay period is funded by the opposite-half payslip (half 1 by last month's half-2 payslip, half 2 by this month's half-1 payslip). Net = payslip total − fixed entries − on-budget monthly expenses due in the period, split evenly per day; a pinned day keeps its amount.
**Specification:**
  Given Nov half 1 (14 days), funding payslip 30,000.00, fixed entries 3,500.00 net, rent 12,000.00 due in the period
  When  today's budget is computed
  Then  net 14,500.00; per day 1,035.71 (unrounded); with 3 days left, 3,107.14
**Parameters:** half 2 → same month; half 1 → previous month (January → previous December)
**Edge cases handled:** no funding payslip → no budget; income is a negative fixed entry; the calendar repeats the formula
**Suspected defect:** only the first matching payslip counts, so a second employer's payslip for the same half is ignored; the per-day default is never rounded.
**Confidence:** Medium — explicit. SME question: "If two employers' payslips exist for the same half, should both fund the period?"

### RULE-028: Where a monthly expense lands; a real bill replaces the estimate
**Category:** Calculation
**Priority:** P0
**Source:** `web/src/lib/payPeriods.ts:103-148`
**Plain English:** A dated expense lands in the pay period containing its date (recurring ones on the same day every month, clamped to short months); an undated one lands in its filed half. A bill in the linked category due that month replaces the estimate's amount and date.
**Specification:**
  Given recurring "Internet" 1,500.00 dated Oct 20, linked to a category with a 1,620.75 bill due Nov 18
  When  November is evaluated
  Then  the estimate (Nov half 2, 1,500.00) is replaced by the bill (Nov half 2, 1,620.75)
**Parameters:** day clamp = min(day, days in month)
**Edge cases handled:** periods start early, so the 30th can fall in the next month's half 1; null-amount bills ignored; several bills all count
**Confidence:** High — explicit.

### RULE-029: Off-budget months: charged to a card or skipped
**Category:** Calculation
**Priority:** P0
**Source:** `web/src/lib/payPeriods.ts:23-38`
**Plain English:** A monthly expense leaves the budget for any month it is skipped, or any month it is charged to a card. A card choice holds from its month until the next choice, and a new choice deletes all later ones.
**Specification:**
  Given `charged_months {"2026-12": Visa, "2027-02": null}`, `skipped_months ["2026-11"]`
  When  months are evaluated
  Then  Nov 2026 off (skipped), Dec–Jan off (Visa), Feb 2027 on; choosing "none" for 2027-01 drops the 2027-02 entry
**Parameters:** month keys are pay-period months
**Edge cases handled:** a choice equal to the inherited card is not stored
**Suspected defect:** an expense charged to a card does not raise that card's balance or dues anywhere; deleting the card leaves the expense off the budget permanently and gone from the card page.
**Confidence:** Medium — explicit. SME question: "Should an expense charged to a card add to that card's dues, and return to the budget when the card is removed?"

### RULE-030: Off-calendar changes spread over pinned days; shortfall banked
**Category:** Calculation
**Priority:** P0
**Source:** `web/src/lib/payPeriods.ts:205-238`
**Plain English:** When something outside the calendar moves a period's budget (a card payment, an expense edit), the pinned days' share is spread over pinned days from today on; what they can't absorb is banked as negative savings on the first open day.
**Specification:**
  Given a 15-day period, all pinned at 500.00, today day 6 (10 open days)
  When  a −6,000.00 card payment change is spread
  Then  the 10 open days drop to 0.00 and −1,000.00 is banked as `saved` on day 6
**Parameters:** share = delta × pinned days ÷ period days, in cents; increases split evenly with leftover cents first; bank day = first open pinned day, else last pinned day
**Edge cases handled:** no pinned days → no writes; past days never changed; a closed last day excluded
**Suspected defect:** banked amounts don't update the next period's "Carry over" until the next calendar edit (acknowledged in a comment).
**Confidence:** High — explicit.

### RULE-031: Budget deltas when expenses or bills change
**Category:** Calculation
**Priority:** P0
**Source:** `web/src/lib/payPeriods.ts:271-301`
**Plain English:** When an expense or bill is added, edited or deleted, every pay period from the current one through the last pinned day gets delta = old deduction − new deduction, spread by RULE-030; ended periods are left alone.
**Specification:**
  Given pinned days through 2026-12-31, today 2026-11-09
  When  a recurring 1,500.00 expense becomes 1,800.00
  Then  each affected half through the last pinned day gets −300.00
**Parameters:** ignore |delta| < 0.005
**Edge cases handled:** off-budget months contribute 0; a failed spread shows "saved, but the calendar's daily amounts didn't update; use Even out"
**Confidence:** High — explicit.

### RULE-032: Cent-exact even split with no negative days
**Category:** Calculation
**Priority:** P0
**Source:** `web/src/lib/payPeriods.ts:155-199`
**Plain English:** Increases are split evenly in whole cents, leftover cents to the earliest days; decreases are taken evenly but never push a day below zero.
**Specification:**
  Given days of 200.00, 500.00, 1,000.00
  When  +1,000.00 / −1,000.00 / −2,000.00 is spread
  Then  +333.34, +333.33, +333.33 / 0.00, 100.00, 600.00 / all 0.00 with 300.00 uncovered
**Parameters:** unit 1 cent
**Edge cases handled:** zero delta or no days → unchanged
**Confidence:** High — explicit.

### RULE-033: Recording a day's spend
**Category:** Calculation
**Priority:** P0
**Source:** `web/src/app/calendar/CalendarClient.tsx:1122-1156`
**Plain English:** Recording a spend pins the day at the spent amount and spreads the leftover or overspend over the period's other open days; on the last day, or with no other open days, the difference is banked as savings.
**Specification:**
  Given a day budget of 1,500.00 and 9 other open days
  When  1,200.00 is recorded
  Then  the others get +33.34 ×3 and +33.33 ×6; on the last day, spending 1,000.00 banks +500.00
**Parameters:** cents rounding; spend ≥ 0; the input accepts + − × ÷ expressions
**Edge cases handled:** past and closed days excluded; an existing saved value on the day is reset
**Confidence:** High — explicit.

### RULE-034: A period's savings carry over to the next
**Category:** Calculation
**Priority:** P0
**Source:** `web/src/app/calendar/CalendarClient.tsx:1076-1120`
**Plain English:** All positive savings in a period become one "Carry over" income entry in the next period; only the change against the existing entry is spread over that period's open days.
**Specification:**
  Given November half 2 days hold 500.00 of positive savings
  When  a spend or budget change is saved
  Then  a fixed entry "Carry over" of −500.00 is created in the next period and +500.00 spread over its open days; at 650.00 it becomes −650.00; at 0 it is deleted
**Parameters:** label "Carry over"; next period = half 1 → half 2, half 2 → next month's half 1
**Edge cases handled:** zero change → no write; an existing row is updated, found by amount < 0 and exact description
**Suspected defect:** overspend (negative savings) never reduces the next period; renaming the row creates a second one; banks made off the calendar (RULE-030) don't trigger it.
**Confidence:** Medium — explicit. SME question: "Should an overspent period's shortfall be deducted from the next pay period?"

### RULE-035: Calendar fixed entries rebalance the period's days
**Category:** Calculation
**Priority:** P0
**Source:** `web/src/app/calendar/CalendarClient.tsx:1049-1072`
**Plain English:** Adding, editing or removing a fixed expense or income on the calendar pins every day of that period and spreads the full change over the open days; any shortfall is banked.
**Specification:**
  Given November half 2 (Nov 12–25), net ≥ 0, today Nov 15
  When  a 1,400.00 fixed expense is added
  Then  Nov 15–25 (11 days) drop by 127.28 ×3 and 127.27 ×8; Nov 12–14 are pinned as they are
**Parameters:** cents rounding
**Edge cases handled:** bank day = first open day, else last day; closed last days excluded
**Suspected defect:** nothing happens when the period's net is null (no payslip) or already negative, so changes to a period in deficit never reach its days.
**Confidence:** Medium — explicit. SME question: "Should expenses added to a period already in deficit still change its days?"

### RULE-036: Installment line totals and plan aggregates
**Category:** Calculation
**Priority:** P0
**Source:** `backend/db.py:498-564`
**Plain English:** Each line's payment = principal + interest. The plan's original total is the sum of line principals; remaining is the sum of line payments from the current installment on; the header amounts come from the current line.
**Specification:**
  Given 12 lines of 1,000.00 + 50.00, current 4
  When  aggregates are recomputed (create, line edit, reorder, pay, edit)
  Then  each line 1,050.00; original total 12,000.00; remaining 9 × 1,050.00 = 9,450.00
**Parameters:** null interest = 0
**Edge cases handled:** no line at current (finished) → header keeps its last values; no lines → zeros
**Suspected defect:** original total excludes interest while remaining includes it, so they can't be compared as "paid so far".
**Confidence:** High — explicit. SME question: "Should the original total include interest?"

### RULE-037: Installment due this month and monthly total
**Category:** Calculation
**Priority:** P0
**Source:** `backend/app/services/installment_service.py:24-96`
**Plain English:** Installment N is due in the month N months after the start month; a plan is due this month when 1 ≤ current ≤ total, remaining > 0 and that month is now. The monthly total adds each due plan's current payment.
**Specification:**
  Given start 2026-10-15, current 1 of 6, remaining 6,300.00, current line 1,050.00, today 2026-11-09
  When  the summary is built
  Then  due in November → due this month += 1,050.00
**Parameters:** due month = first of the start month + current months
**Edge cases handled:** no start date → never due; due payment falls back to the header payment
**Suspected defect:** the server summary sums originals and remainders across finished plans while the page sums only active ones; the server date may differ from the user's at month boundaries.
**Confidence:** High — explicit. SME question: "Is installment #1 really billed the month after the start month?"

### RULE-038: Statement counts as paid only when fully covered
**Category:** Calculation
**Priority:** P0
**Source:** `backend/app/routers/credit_card.py:71-76`
**Plain English:** A card statement is paid once payments dated on or after the statement date add up to at least its balance; partial payments don't count.
**Specification:**
  Given statement 2026-10-15, balance 10,000.00
  When  payments of 4,000.00 (10-20) and 6,000.00 (11-02) exist
  Then  paid; with 9,999.00 total, not paid; a payment dated 10-09 is ignored
**Parameters:** ≥ balance; dates compared as ISO strings
**Edge cases handled:** no statement date or balance ≤ 0 → never paid; a paid card is left out of home dues and reminders
**Confidence:** High — explicit and covered by `backend/test_core.py`.

### RULE-039: Card dues this month
**Category:** Calculation
**Priority:** P0
**Source:** `backend/app/routers/credit_card.py:63-68`
**Plain English:** A card's monthly dues = its minimum due + the current payment of each installment on it due this month.
**Specification:**
  Given minimum due 850.00 and two installments due at 1,050.00 and 2,000.00
  When  the card list is served
  Then  monthly dues = 3,900.00
**Parameters:** none
**Edge cases handled:** missing minimum due → 0
**Suspected defect:** a bank's minimum due usually already includes that cycle's installment amortizations, so dues may be double-counted.
**Confidence:** Medium — explicit. SME question: "Does the card's minimum due already include this month's installment amortizations?"

### RULE-040: Linked card's statement comes from its latest bill
**Category:** Calculation
**Priority:** P0
**Source:** `backend/db.py:1094-1112`
**Plain English:** For a card linked to a bill category, the statement date, due date, balance and minimum due are read from that category's latest bill.
**Specification:**
  Given bills dated 2026-10-05 (15,000.00, minimum 850.00, due 10-25) and 2026-09-05
  When  the card is read
  Then  it shows 15,000.00 / 850.00 / 2026-10-05 / 2026-10-25; the older bill is ignored
**Parameters:** latest = bill date descending, then id
**Edge cases handled:** null bill amount or minimum keeps the card's typed value; dates are always overwritten, even with null
**Confidence:** High — explicit and tested.

### RULE-041: Reading a payslip PDF into pay fields
**Category:** Calculation
**Priority:** P1
**Source:** `backend/app/services/payslip_parse.py:184-221`
**Plain English:** From the current-period table only, the parser reads net salary as the total, sums allowances and subsidies, and puts other earnings into "others" with their names in the notes; deductions without a field are dropped.
**Specification:**
  Given a payslip for the period starting 2025-08-16 with basic 25,000.00, rice subsidy 1,000.00, laundry allowance 300.00, signing bonus 5,000.00, an SSS loan 1,200.00 and net 20,000.00
  When  it is parsed
  Then  half 2, basic 25,000.00, allowances 1,300.00, others 5,000.00 (notes "SIGNING BONUS"), total 20,000.00; the loan is ignored
**Parameters:** half 1 if the start day ≤ 15, else 2; sums rounded to 2 decimals
**Edge cases handled:** non-matching layout → none; earnings vs deductions by column position
**Confidence:** High — explicit.

### RULE-042: "Even out" a period's remaining budget
**Category:** Calculation
**Priority:** P1
**Source:** `web/src/app/calendar/CalendarClient.tsx:1182-1205`
**Plain English:** Even out resets every open day to (net − kept days − positive savings) ÷ open days, never below zero.
**Specification:**
  Given net 10,000.00 and 3 open days
  When  "Even out" is pressed
  Then  each day 3,333.33 (total 9,999.99)
**Parameters:** per-day amount rounded to cents
**Edge cases handled:** periods without a payslip or open days skipped; closed last days kept
**Suspected defect:** per-day rounding instead of the cent-exact split (RULE-032), so the total can be off by a few cents.
**Confidence:** High — explicit.

### RULE-043: Payslip gross and deduction totals
**Category:** Calculation
**Priority:** P1
**Source:** `web/src/app/payslip/payslipAggregates.ts:65-118`
**Plain English:** Deductions = withholding tax + SSS + PhilHealth + Pag-IBIG + MP2 + bereavement. "Gross" has two definitions: a component sum without the 13th month (detail view) and net total + deductions (yearly and monthly sums).
**Specification:**
  Given basic 25,000, commission 5,000, 13th month 25,000, withholding 3,000, SSS 1,000, net total 51,000
  When  gross is shown
  Then  detail gross 30,000.00; stats gross 55,000.00; Salary Stats take-home 55,000 − 4,000 = 51,000
**Parameters:** deduction list above
**Edge cases handled:** null or NaN fields count as 0
**Suspected defect:** three inconsistent definitions; Salary Stats recomputes take-home instead of reading the payslip total, so it diverges whenever an unparsed deduction (a loan) exists.
**Confidence:** Medium — explicit. SME question: "Which gross and take-home definition is authoritative?"

### RULE-044: Remaining travel price
**Category:** Calculation
**Priority:** P2
**Source:** `web/src/lib/remainingPrice.ts:16-25`
**Plain English:** Remaining = total price − paid, shown only when both are single amounts in the same currency.
**Specification:**
  Given total "THB 4,200" and paid "1,000"
  When  remaining is shown
  Then  "THB 3,200.00"; paid "", "30%" or "USD 50" → blank
**Parameters:** en-US format, 2 decimals
**Edge cases handled:** blank paid is not 0; shorthand and percentages rejected (`remainingPrice.check.ts`)
**Confidence:** High — explicit and checked.

## Lifecycle

### RULE-045: A card payment lowers the balance and books a budget expense
**Category:** Lifecycle
**Priority:** P0
**Source:** `backend/db.py:1215-1240`
**Plain English:** Recording a payment, in one transaction, saves it, lowers the card balance by the amount, adds a fixed expense "<card> payment" to the chosen pay period, and tells the page how much that period's budget moved.
**Specification:**
  Given card "BPI Gold" at 25,000.00
  When  a 5,000.00 payment for 2026-11 half 1 is posted
  Then  balance 20,000.00; fixed expense "BPI Gold payment" 5,000.00 linked to the payment; `budget_changes [{2026, 11, 1, −5,000.00}]` (spread by RULE-030)
**Parameters:** description "{card name} payment"; delta = −amount
**Edge cases handled:** unknown card → 404, nothing written; overpayment allowed (balance can go negative); card, installment and fixed-expense caches cleared
**Confidence:** High — explicit, one transaction, tested.

### RULE-046: Editing a payment rebalances card and budget
**Category:** Lifecycle
**Priority:** P0
**Source:** `backend/db.py:1243-1278`
**Plain English:** When a payment's amount or period changes, the balance moves by the difference and the linked budget expense takes the new amount and period; the page gets a budget change per affected period.
**Specification:**
  Given a 5,000.00 payment, balance 20,000.00, expense in 2026-11 half 1
  When  edited to 4,000.00 (same period), or moved to 2026-12 half 2
  Then  balance 21,000.00 and change +1,000.00; or changes +5,000.00 (old) and −4,000.00 (new)
**Parameters:** shift = old − new
**Edge cases handled:** if the linked expense is gone, only the balance changes and `budget_changes = []`; the description isn't refreshed after a card rename
**Confidence:** High — explicit.

### RULE-047: Deleting a payment restores card and budget
**Category:** Lifecycle
**Priority:** P0
**Source:** `backend/db.py:1281-1297`
**Plain English:** Removing a payment deletes its budget expense first, then the payment, and adds the amount back to the card balance.
**Specification:**
  Given a 5,000.00 payment linked to an expense in 2026-11 half 1, balance 20,000.00
  When  the payment is deleted
  Then  expense and payment deleted, balance 25,000.00, `budget_changes [{2026, 11, 1, +5,000.00}]`
**Parameters:** none
**Edge cases handled:** expense deleted first because the FK is SET NULL; if it was already gone the balance is still restored
**Confidence:** High — explicit.

### RULE-048: Calendar edits of a card-payment line don't touch the payment
**Category:** Lifecycle
**Priority:** P0
**Source:** `backend/db.py:924-937`
**Plain English:** On the calendar a card payment's budget line is an ordinary fixed expense: editing or deleting it changes only the budget, never the payment or the card balance.
**Specification:**
  Given a 5,000.00 card payment with its "BPI Gold payment" line on the calendar, balance 20,000.00
  When  the line is deleted on the calendar
  Then  the budget gets 5,000.00 back, but the payment remains and the balance stays 20,000.00; later payment edits return `budget_changes = []`
**Parameters:** the update writes only amount and description
**Edge cases handled:** none; the fixed-expense cache is cleared but nothing reconciles payment and card
**Suspected defect:** budget and card ledger drift apart without warning.
**Confidence:** Medium — explicit; a comment suggests the drift is accepted. SME question: "Should a card-payment line on the calendar be read-only, or should editing it also edit the payment?"

### RULE-049: "Paid" on a monthly expense logs or deletes a house-payment entry
**Category:** Lifecycle
**Priority:** P0
**Source:** `web/src/app/monthly-expenses/MonthlyExpensesClient.tsx:299-313`
**Plain English:** For an expense linked to a house payment, saving with "Paid" checked logs an entry for that pay-period month; saving with it unchecked deletes the entry found for that month.
**Specification:**
  Given "Condo" 12,000.00 linked to "Unit 5B", today 2026-11-09
  When  saved with "Paid for November 2026" checked and no entry yet
  Then  an entry {paid_on 2026-11-09, amount = the linked bill due that month, else 12,000.00} is created
**Parameters:** "paid" = any entry dated in that pay-period month; no status column
**Edge cases handled:** the entry write is a separate call after the save; no duplicate entry when one exists
**Suspected defect:** the delete branch runs whenever the box is unchecked: a new expense (unchecked by default) linked to the same house payment deletes an existing entry, and in "show all" mode a hidden box can delete a real entry.
**Confidence:** Medium. SME question: "Should saving an expense ever delete a house-payment entry it didn't create?"

### RULE-050: Changing an installment's count resets its schedule
**Category:** Lifecycle
**Priority:** P0
**Source:** `backend/db.py:638-688`
**Plain English:** When the number of installments changes, lines past the new count are deleted and every remaining line, paid ones included, is reset to the form's principal and interest; with the count unchanged, the form's amounts are ignored.
**Specification:**
  Given 12 lines where line 3 was edited to 1,200.00 and the rest are 1,000.00 + 50.00
  When  the plan is saved with 10 installments
  Then  lines 11–12 deleted, lines 1–10 all 1,050.00, original total 10,000.00, remaining recomputed
**Parameters:** upsert on (installment, seq)
**Edge cases handled:** plans without lines keep the typed header values; total ≤ 0 deletes all lines
**Suspected defect:** custom line amounts and paid history are overwritten without warning; a typed principal or interest change is ignored unless the count also changes.
**Confidence:** Medium — mechanics explicit. SME question: "On a term change, should existing lines (at least paid ones) keep their amounts?"

### RULE-051: A covering card payment auto-advances installments, never undone
**Category:** Lifecycle
**Priority:** P0
**Source:** `web/src/app/credit-card/CreditCardClient.tsx:799-819`
**Plain English:** A new card payment is filed in the pay period of its date; if it is at least the card's monthly dues, every installment on the card due this month moves forward one payment (unless unticked). Editing or deleting the payment later never moves them back.
**Specification:**
  Given monthly dues 6,500.00 with installments A and B due this month
  When  a 7,000.00 payment is saved, then deleted
  Then  A and B each advance one installment; after the delete the balance is restored but A and B stay advanced
**Parameters:** covers = amount ≥ monthly dues (RULE-039); new payments only
**Edge cases handled:** per-installment checkboxes override; failures are collected and reported
**Suspected defect:** no reversal path (no "unpay" endpoint).
**Confidence:** High — explicit. SME question: "Should deleting or shrinking a card payment roll back installments it advanced?"

### RULE-052: A typed statement resets the balance; linked cards never reset
**Category:** Lifecycle
**Priority:** P0
**Source:** `backend/db.py:1134-1168`
**Plain English:** A new card starts with balance = statement balance. For a card without a bill link, entering a different statement balance resets the current balance to it; renames and bill-linked cards leave the balance alone.
**Specification:**
  Given an unlinked card with stored statement 18,000.00 and balance 12,000.00
  When  saved with statement 22,000.00, or renamed with 18,000.00
  Then  balance 22,000.00 (payments since are not subtracted); or unchanged
**Parameters:** reset when no bill link and statement ≠ stored
**Edge cases handled:** manual "available limit" adjust sets balance = limit − available
**Suspected defect:** for linked cards new charges never enter the balance; only payments and manual adjustments move it, so available credit drifts.
**Confidence:** Medium. SME question: "When a new bill arrives for a linked card, should the balance reset to the bill amount?"

### RULE-053: A write clears its cache namespaces and linked ones
**Category:** Lifecycle
**Priority:** P0
**Source:** `backend/app/factory.py:30-118`
**Plain English:** After any successful POST, PUT, PATCH or DELETE, cached reads for that feature are cleared, plus features that show the changed data; a write to users also clears the "login required" flag.
**Specification:**
  Given cached `credit_card:list` and `installment:list:500`
  When  `POST /api/installment/<id>/pay` returns 200
  Then  all `installment:*` and `credit_card:*` keys are deleted
**Parameters:** installment → credit_card; bill → credit_card, monthly_expense; house_payment → monthly_expense; credit_card → installment, fixed_expense; longest prefix wins; TTL 86,400 s
**Edge cases handled:** responses ≥ 400 clear nothing; companies, auth, search, mosaic, mambo are not cached
**Suspected defect:** date-dependent values (monthly dues, due this month) are cached up to 24 h with no date in the key, so they can show last month's dues after a month change; a concurrent read can re-cache pre-commit data.
**Confidence:** Medium. SME question: "Is up to 24 h of stale 'due this month' acceptable, or should those keys expire at the day or month boundary?"

### RULE-054: Deploy order: tests, migration, flush, schema sync, start
**Category:** Lifecycle
**Priority:** P0
**Source:** `.github/workflows/deploy.yml:117-126`
**Plain English:** Production changes only after tests pass; data migrations run with the new image while the old API keeps serving, and the cache is cleared before and after the new API starts.
**Specification:**
  Given a push to main that passes backend checks, typecheck and lint
  When  the deploy job runs
  Then  pull images → UUID migration (no-op once done) → flush Redis → `sync_schema.py` (a failure stops with the old API running) → `compose up --wait` (200 s) → flush again → prune
**Parameters:** lock timeout 30 s; backup schema `pre_uuid_ids`; concurrency group `deploy-lightsail`
**Edge cases handled:** the second flush clears anything the old API cached in between; `set -e` stops on the first failure
**Confidence:** High. SME question: "Between the migration commit and the new API starting, the old API expects integer ids; is a brief error window acceptable?"

### RULE-055: API start syncs schema, seeds games, wipes the cache
**Category:** Lifecycle
**Priority:** P0
**Source:** `backend/app/factory.py:80-90`
**Plain English:** On startup the API adds missing tables and columns, makes sure the five PCSO games exist, then flushes Redis so nothing from an older build is served.
**Specification:**
  Given Redis holds cached lists, failed-login counters and a pending passkey challenge
  When  the API starts
  Then  schema sync and game seeding run, then every Redis key is cleared (sessions survive in the database)
**Parameters:** seeded games: Grand Lotto 6/55, Megalotto 6/45, Ultra Lotto 6/58, Superlotto 6/49, Lotto 6/42
**Edge cases handled:** Redis unreachable → flush is a no-op
**Confidence:** High. SME question: "Is it intended that a restart resets login lockouts?"

### RULE-056: Schema changes are additive only
**Category:** Lifecycle
**Priority:** P0
**Source:** `backend/schema.py:661-678`
**Plain English:** The automatic schema sync only creates missing tables and adds missing columns with their foreign keys; it never drops, renames, retypes or re-indexes.
**Specification:**
  Given a table without a column the model defines
  When  the sync runs (startup or deploy)
  Then  `ALTER TABLE … ADD COLUMN` plus its FK runs and is reported; a renamed column appears as a new empty column beside the old data
**Parameters:** none
**Edge cases handled:** wholly missing tables via `create_all`; type and index differences ignored
**Confidence:** High.

### RULE-057: PCSO sync: resume, reuse, back off, fill only missing
**Category:** Lifecycle
**Priority:** P1
**Source:** `backend/app/services/pcso_results.py:106-135`
**Plain English:** A sync asks PCSO only for days whose draws can be posted, reuses a fetch from the last 15 minutes, waits longer after each failure, and fills only draws that have no numbers yet.
**Specification:**
  Given the latest result is 2026-11-07 and it is 13:00 in the Philippines on 2026-11-09
  When  `POST /api/lotto/sync-pcso` runs
  Then  it fetches 2026-11-08 only (today excluded before 14:30); a repeat within 15 minutes uses the snapshot; after failures it waits 10 min, then 20 min … up to 6 h
**Parameters:** 90 days; first results 14:30 PH; reuse 15 min; backoff 10 min × 2^(n−1), max 6 h; timeout 30 s
**Edge cases handled:** 403/429 drops session cookies; success resets the failure count; state is per process
**Confidence:** High.

## Rules requiring SME confirmation

Every Medium-confidence rule and every rule with an owner question. P0 rules among these, and P0 rules with a suspected
defect, are what `/code-modernization:modernize-review` asks about.

| Rule | Confidence | Question |
|---|---|---|
| RULE-002 | High | Is running open while no users exist acceptable on the internet-facing deployment, and should `BUDGET_DISABLE_AUTH` be honored in production? |
| RULE-004 | High | Are page restrictions meant as a security boundary, or only to tidy the UI? |
| RULE-005 | High | Should deleting the last user, or the last superuser, be refused? |
| RULE-006 | Medium | Is uvicorn configured to trust X-Forwarded-For from the edge proxy in production? |
| RULE-007 | High | Is the check-password tool needed, and should it share the login throttle or be admin-only? |
| RULE-008 | Medium | What session lifetime is acceptable, and should password changes and user deletion revoke all sessions at once? |
| RULE-010 | Medium | Should a category that still has bills or linked cards be refused, like companies? |
| RULE-014 | Medium | Should renaming a company carry its payslips and defaults with it, and should the guard ignore letter case? |
| RULE-016 | Medium | Should the server's bounds use the payday-based defaults and check the following month's start? |
| RULE-019 | Medium | Must a pay period's daily amounts always add up to its budget, and should the server enforce it? |
| RULE-024 | Medium | Should "due this month" roll over at Philippine midnight rather than the server's date? |
| RULE-025 | Medium | Should one payslip per company and period be enforced? |
| RULE-026 | Medium | Should the server-side override bounds use the same payday defaults as the calendar? |
| RULE-027 | Medium | If two employers' payslips exist for the same half, should both fund the period? |
| RULE-029 | Medium | Should an expense charged to a card add to that card's dues, and return to the budget when the card is removed? |
| RULE-034 | Medium | Should an overspent period's shortfall be deducted from the next pay period? |
| RULE-035 | Medium | Should expenses added to a period already in deficit still change its days? |
| RULE-036 | High | Should the original total include interest? |
| RULE-037 | High | Is installment #1 really billed the month after the start month? |
| RULE-039 | Medium | Does the card's minimum due already include this month's installment amortizations? |
| RULE-043 | Medium | Which gross and take-home definition is authoritative? |
| RULE-048 | Medium | Should a card-payment line on the calendar be read-only, or should editing it also edit the payment? |
| RULE-049 | Medium | Should saving an expense ever delete a house-payment entry it didn't create? |
| RULE-050 | Medium | On a term change, should existing lines (at least paid ones) keep their amounts? |
| RULE-051 | High | Should deleting or shrinking a card payment roll back installments it advanced? |
| RULE-052 | Medium | When a new bill arrives for a linked card, should the balance reset to the bill amount? |
| RULE-053 | Medium | Is up to 24 h of stale "due this month" acceptable, or should those keys expire at the day or month boundary? |
| RULE-054 | High | Is a brief error window between the UUID migration commit and the new API starting acceptable? |
| RULE-055 | High | Is it intended that a restart resets login lockouts? |
