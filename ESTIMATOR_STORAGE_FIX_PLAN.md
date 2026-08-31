# Estimator company-scoped storage: plan

Status: planned, not built. Supersedes the earlier user-level-only version of
this plan (that file never made it to disk; this is the real one).

## Goal

Storage scoped **by company**, not by individual user. Every user under a
company can see and work on that company's projects and files. Two users on
different companies must never see each other's data. Confirmed current
state (checked directly against code, not just the earlier audit):

- No `Company` model exists anywhere in `prisma/schema.prisma`.
- Estimator signup (`EstimatorAuthForm`, `/estimator/signup`) is email +
  password only, no company concept at all.
- `simple-app.js` calls `aiestimator-api` (`public/estimator/config.js`
  `API_BASE`, an Azure App Service origin) directly from the browser, cross
  origin, with **no credentials or auth header on any of those calls** except
  the same-origin `/api/estimator/settings` fetch. So the browser has never
  been able to prove who's calling, and can't safely hold a shared secret
  either. A same-origin proxy through `sueep-site` is required, not optional.
- `aiestimator-api`'s `get_user_prefix()` (`app/api/auth_utils.py`) reads an
  Azure Easy Auth header that's never set in deployment, so every project is
  created as `user_prefix = "anon"`, and `list_projects` applies no filter at
  all. `Project.user_prefix` is a real, non-nullable column already.
- This morning's `f3befd3` ("authentication fixes") gated
  `/erp/(shell)/estimator/page.tsx` behind the *ERP* session, and fixed a
  redirect loop on the standalone `/estimator` shell. It did not give the
  ERP-embedded entry point an `EstimatorUser` identity. Per the user
  (2026-08-31): a teammate is separately changing that ERP nav link to open
  `app.sueep.com/estimator` in a new window instead of embedding the tool, so
  it will go through the same `/estimator` login as everything below. **This
  plan does not touch the ERP-embedded entry point.**

## 1. Data model (`sueep-site`, Postgres — source of truth for identity)

```prisma
model Company {
  id         String   @id @default(cuid())
  name       String
  inviteCode String   @unique
  createdAt  DateTime @default(now())

  estimatorUsers EstimatorUser[]
}
```

`EstimatorUser` gets a `companyId String?` (nullable at first — see backfill
below — tightened to non-nullable in a follow-up migration once every row is
backfilled). Two-migration pattern, standard for adding a required FK to an
existing populated table:

1. Add `companyId` nullable, no default.
2. Backfill every existing row (see "Legacy data" below).
3. Second migration: make it `NOT NULL`.

**Revised 2026-08-31: one role after all.** `EstimatorUser.role`
(`OWNER` | `MEMBER`, default `MEMBER`). Everyone in a company still gets
full access to that company's *files*, this isn't a permissions tier on
storage, it only gates the member-management screen below. Whoever creates
the company (flow A) gets `OWNER`; whoever joins via invite code (flow B)
gets `MEMBER`. No ownership transfer for v1, if an owner is ever removed
from their own company, that company is just ownerless until this gets
revisited.

## 2. Signup / invite-code flow

Per your call: invite code, not email-domain matching or admin approval.

- `/estimator/signup` gets a second step (or a toggle): **"Create a
  company"** (just a name, generates a short unique `inviteCode`, e.g. 8
  chars, shown once with a copy button) vs **"Join a company"** (paste an
  invite code).
- Company `name` is *not* unique — two different real companies can
  reasonably both be "Acme Painting." Only `inviteCode` needs to be unique,
  and that's what actually gates joining, so a name collision is harmless.
- The invite code should also live somewhere reachable after signup (e.g. on
  `/estimator/settings`) so the first user can pull it up again to invite
  teammates, not just see it once at signup and lose it.
- `POST /api/estimator/auth/session` (or wherever the account gets created,
  worth checking whether that's the same route or a separate signup route)
  needs the create-vs-join branch: create makes a `Company` row, join looks
  up by `inviteCode` and 404s/errors clearly if it doesn't match anything.

## 3. Session & identity forwarding

- `estimator_session` JWT (`src/lib/estimatorSession.ts`) already carries
  `userId` + `firebaseUid`. Add a `companyId` claim, minted server-side from
  `EstimatorUser.companyId` at session-creation time — never trust a
  client-supplied companyId.
- New proxy route in `sueep-site`, e.g. `/api/estimator/proxy/[...path]`,
  same shape as the earlier plan's recommendation:
  - reads the session via `getEstimatorUserFromSession()` (already exists,
    `src/lib/estimatorAuthServer.ts`)
  - rejects with 401 if there's no session or no `companyId`
  - forwards the request to `aiestimator-api`, adding
    `x-estimator-company-id: <companyId>` and a shared-secret header
    (`ESTIMATOR_INTERNAL_SECRET`, same pattern already used elsewhere in this
    repo for internal service calls)
- `simple-app.js` / `config.js`'s `API_BASE` changes from the direct Azure
  origin to this same-origin proxy path. That also fixes the CORS-shaped
  trust problem described above as a side effect, not just the auth gap.

## 4. Backend (`aiestimator-api`)

- Add `get_authenticated_company_id(request)` to `auth_utils.py`: trusts
  `x-estimator-company-id` **only** when the shared-secret header matches;
  otherwise 401. No silent `"anon"` fallback like today, since that fallback
  is exactly how the current no-isolation bug exists.
- Add a new `Project.company_id` column rather than repurposing
  `user_prefix` — the existing column is a per-user string prefix, and
  overloading it to mean something company-shaped is more confusing than a
  clean new column plus deprecating the old one once nothing reads it.
- Filter every read path by `company_id`: `list_projects`, `get_project`,
  file download, annotations, figures. Drop "project name globally unique,"
  make it unique per company instead (two companies can both have a project
  named "123 Main St").
- Once verified in production, remove the dead Easy Auth code path
  (`get_user_prefix`) and, per the earlier audit, the unused legacy
  `/api/files/*` router.

## 5. Legacy data

Per your call: grandfather everything into one "Sueep" company rather than
leaving existing work inaccessible.

- Pick one `Company.id` value up front (mint it once, e.g. a fixed cuid
  literal) and use that *same* literal in both migrations, since
  `sueep-site` and `aiestimator-api` are separate Postgres databases with no
  foreign key between them — the id has to be copy-pasted, not generated
  independently on each side.
- `sueep-site` migration: create that one `Company` row ("Sueep"), set
  `companyId` on every existing `EstimatorUser` to it.
- `aiestimator-api` migration: set `company_id` on every `Project` where
  `user_prefix = 'anon'` to that same id.

## 6. User flow

**Built simpler than originally drafted here**: rather than putting the
create/join choice on the signup form itself (which would've meant stashing
it in sessionStorage to survive the gap between the form's own submit
handler and the passive `onAuthStateChanged` listener that actually calls
`establishSession()`), every brand-new `EstimatorUser` is created with
`companyId = null`, full stop, no exceptions. A single client-side redirect
rule in `estimatorAuthContext.tsx` then sends anyone logged in without a
company to `/estimator/company/setup` instead of the real tool. That one
gate serves both flows below, and the "bad invite code" edge case, for free.

**A. New user creates a company** (first person from that company to sign up)
1. `/estimator/signup` → plain display name / email / password, unchanged
   from before.
2. Lands on `/estimator/company/setup` (companyId is null for every new
   signup) → picks "Create a company", types a name →
   `POST /api/estimator/company` creates the `Company` row + invite code,
   sets this user's `companyId` + `role: OWNER`.
3. Same screen shows the code inline: "Company created. Invite code:
   `A3F9K2LQ` [Copy]." → Continue → into `/estimator`.
4. The code is also always visible later in Settings, not just at this
   one moment.

**B. New user joins an existing company**
1. Same signup, same landing on `/estimator/company/setup`.
2. Picks "Join a company", enters the invite code →
   `POST /api/estimator/company/join` looks it up and sets `companyId` +
   `role: MEMBER`.
3. Straight into `/estimator` on success.
4. **Bad code case**: the endpoint just returns an error, shown inline on
   the same setup screen, they stay right there and can retry with a
   different code. No orphaned state to clean up, since `companyId` was
   already null and stays null. Same screen also catches anyone who
   somehow ends up companyless later (e.g. flow D2 below).

**C. Existing user signs in** (any login after the first)
1. Firebase sign-in only, no company fields shown, nothing stashed.
2. `establishSession()` hits the `update` branch of the existing upsert,
   `companyId` untouched, exactly like `email`/`displayName` already work
   today.
3. Session JWT re-minted with the `companyId` claim read fresh from the DB
   row. Into `/estimator` with full access to that company's projects.

**D. Inviting a teammate**
1. Any member opens Settings, copies the invite code shown there. Viewing/
   sharing the code isn't owner-gated, everyone in the company can invite.
2. Shares it out-of-band (Slack, text, whatever).
3. Teammate runs flow B, joins as `MEMBER`.

**D2. Owner manages members** (owner-only)
1. Settings shows a member list (name, email, role) for the owner's
   company, `OWNER` only, `MEMBER`s don't see this section.
2. Owner can remove a member. That just clears their `companyId`/`role`
   back to unset, doesn't delete their `EstimatorUser` row or Firebase
   account, they land on the same companyless "join a company" gate from
   flow B and need a fresh invite code to get back into any company.
3. Owner can't remove themselves this way (no self-service ownership
   transfer in v1, see the role note above).

**E. Estimator tool itself** (the actual payoff)
1. Logged-in user opens `/estimator`, `simple-app.js` loads.
2. Its calls go to the new same-origin proxy instead of the direct Azure
   URL. Proxy reads the session cookie, pulls `companyId`, forwards it
   + the shared secret to `aiestimator-api`.
3. Backend filters every project/file query by `company_id`. New
   projects/uploads are stamped with the caller's company automatically.
4. Two different companies' users, side by side, see none of each other's
   projects.

## 7. Implementation phases

Ordered so every phase up through the cutover is either fully inert or
independently testable, so nothing forces a big-bang release.

**Phase 0 — data model only.** `Company` model + nullable
`EstimatorUser.companyId` + `EstimatorUser.role` (`OWNER`/`MEMBER`, default
`MEMBER`) in `prisma/schema.prisma`, one migration. Nothing reads or writes
the new columns yet. Zero user-facing change, safe to merge any time.

**Phase 1 — company creation & join. Built 2026-08-31.** Landed simpler
than first drafted (see the user-flow section above): a single
`/estimator/company/setup` gate for any companyless login, backed by
`POST /api/estimator/company` (create, becomes `OWNER`) and
`POST /api/estimator/company/join` (join by code, becomes `MEMBER`), plus
`DELETE /api/estimator/company/members/[id]` (owner-only removal, clears
the target's `companyId`/`role` rather than deleting their account).
Settings gained a Company section: invite code for everyone, member list +
remove for the owner. Files: `estimatorCompany.ts` (invite-code
generation), the three new `/api/estimator/company*` routes, redirect
logic in `estimatorAuthContext.tsx`, `company/setup/page.tsx`, and the
`CompanySection` addition to `estimator/settings/page.tsx`. `tsc --noEmit`
and `eslint` both clean. Not yet manually tested end-to-end in a browser.
`EstimatorAuthForm.tsx` and the signup page ended up untouched, the
create/join choice never needed to live there.

**Phase 2 — session carries companyId.** Add the `companyId` claim to the
`estimator_session` JWT, re-minted on every login (not just signup) from
the DB row. Everyone's existing session predates this claim, so this phase
implicitly requires a re-login within the current 7-day expiry, not a hard
break, just worth knowing. No behavior change to the tool itself yet, just
makes `companyId` available to whatever reads the session next.

**Phase 3 — aiestimator-api scoping, behind a flag. Built 2026-08-31.**
`Project.company_id` (nullable) added to `app/models.py`, plus the
matching `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` + index in
`app/main.py`'s startup lifespan, this repo's existing convention for
schema changes (no Alembic here), so it lands automatically on the next
local run or Azure deploy, not something I ran by hand against production.
`get_authenticated_company_id()` added to `auth_utils.py` alongside the
old `get_user_prefix()` (left in place, still needed for the NOT NULL
`user_prefix` column until Phase 6), gated behind `ENFORCE_COMPANY_SCOPING`
(unset/false today), returns `None` — meaning "don't filter" — until
that's `"true"`, at which point a missing/wrong `ESTIMATOR_INTERNAL_SECRET`
or missing `x-estimator-company-id` header is a hard 401, no silent `anon`
fallback. Every project-scoped endpoint in `router_projects.py` (12 of
them) now routes through one `get_owned_project()` helper instead of
each hand-rolling its own `select(Project).where(Project.id == ...)`, a
few of which (`quotation-data`, `figures`, `download`,
`delete_project_file`) had **no existence or ownership check on the
project at all** before this, just trusted the ID in the URL. Project-name
uniqueness is now scoped per-company too, once enforcement is on. Verified
with `py_compile`, a real `import app.main` (registers all 15 routes
cleanly), and a standalone test of `get_authenticated_company_id()`'s 5
branches (flag off, no server secret, wrong secret, missing company
header, valid). Not yet deployed, not yet exercised against a real
request. Flipping the flag on is still Phase 4c, deliberately not this
one, since flipping it before the proxy exists would 401 every request in
production.

**Phase 4 — cutover.**
  - **4a. Built and verified 2026-08-31.** `/api/estimator/proxy/[...path]/route.ts`
    in `sueep-site`: reads the session, 401s with no session, 403s with no
    `companyId`, then forwards to `aiestimator-api` (`ESTIMATOR_API_BASE`,
    defaults to the production Azure host) with `x-estimator-company-id` +
    `x-estimator-internal-secret` attached server-side, streaming the
    request/response bodies both ways (so large blueprint uploads and the
    file-download endpoint both still work without buffering the whole
    thing in memory). `public/estimator/config.js`'s `API_BASE` now just
    points at this same-origin path instead of guessing local-vs-prod from
    the hostname. New env var `ESTIMATOR_INTERNAL_SECRET` generated and set
    in `.env.local`/`.env.example`, must match the same value in
    `aiestimator-api`'s environment (no shared `.env` between the two
    repos, that has to be set independently on each side, and in Azure App
    Service's Application Settings for production, not a file). Verified
    live end to end: no-session request 401s, a minted session with no
    `companyId` would 403 (not separately re-tested, follows directly from
    the same check Phase 1 already exercised), and a real authenticated
    request round-tripped through the proxy to the live backend and back
    with real project data. Flag still off throughout, so this changed
    which URL the browser hits and nothing else, filtering is still inert.
  - 4b. Run the legacy backfill (below) so existing users don't get
    walled off the moment enforcement turns on.
  - 4c. Flip `ENFORCE_COMPANY_SCOPING` on. **Not done yet, deliberately.**
    This is the one moment with real user-facing risk, plan to test with a
    second throwaway company account side-by-side with Sueep first, and
    keep the flag as a fast rollback if something's wrong. Needs an actual
    deploy of the `aiestimator-api` changes too, everything in Phase 3/4a
    is still sitting locally uncommitted on that repo's
    `vector-wall-detection-fixes` branch.

**Phase 5 — legacy backfill. Fully done 2026-08-31, both sides.** The
`sueep-site` half used the real Phase 1 UI rather than a migration script:
a dedicated `estimating@sueep.com` account created the "Sueep" company for
real through `/estimator/company/setup` (id `cmthly0iz0003d9jdx7g1b4u7`,
OWNER), and the two pre-existing companyless accounts (`emma@sueep.com`,
`namrata@sueep.com`) were folded in as MEMBERs via a direct one-row-each DB
update. The `aiestimator-api` half: `UPDATE projects SET company_id =
'cmthly0iz0003d9jdx7g1b4u7' WHERE company_id IS NULL` against the live
Azure Postgres, all 45 existing projects (previously all `user_prefix =
"anon"`) now belong to Sueep. Confirmed 0 rows left null before flipping
enforcement.

**Phase 6 — cleanup.** Once enforcement has been on and stable: delete
`get_user_prefix()`, Easy Auth references, the legacy `/api/files/*`
router, the old `user_prefix` column, and the `ENFORCE_COMPANY_SCOPING`
flag itself (just always-on at that point).

## Explicitly out of scope here

- The ERP-embedded `/erp/estimator` entry point — being redirected to
  `/estimator` in a separate fix, not bridged.
- Per-role permissions within a company (everyone in a company gets full
  access to that company's files, matching the ask).
- Billing/paywall, Pyramid AI move — unrelated, tracked separately.
