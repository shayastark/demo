# Release Readiness Runbook

This runbook covers release verification for collaboration, discovery, notifications, and update scheduling flows.

## Migration Order Checklist

Apply SQL migrations in chronological order already committed in `supabase/`. For the most recent collaboration and updates work, confirm these exist and are applied:

1. `supabase/add_project_updates_is_important.sql`
2. `supabase/add_project_updates_draft_status.sql`
3. `supabase/add_project_updates_scheduled_publish_at.sql`
4. `supabase/add_project_subscription_notification_mode.sql`
5. `supabase/backfill_project_updates_is_important.sql` (optional compatibility backfill; safe/idempotent)

Checklist:

- [ ] Run all pending migrations in staging first.
- [ ] Verify new columns are present (`status`, `published_at`, `scheduled_publish_at`, `notification_mode`).
- [ ] Verify no migration errors and idempotent rerun behavior.

### Private Access Stack (Required Order)

For reliable private-access grants by username/email, these migrations must be present in this order:

1. `supabase/add_project_access_grants_table.sql`
2. `supabase/add_project_access_grants_expiry.sql`
3. `supabase/add_project_access_grant_roles.sql`
4. `supabase/add_project_access_requests_table.sql` (required for request/review flows)

Local/staging checklist snippet:

1. Apply the four SQL files above in order in Supabase SQL editor or migration runner.
2. Verify columns on `project_access_grants`: `project_id`, `user_id`, `granted_by_user_id`, `created_at`, `expires_at`, `role`.
3. Verify `project_access_requests` table exists if access requests are enabled.

## Smoke Test Checklist (Core Loops)

### Access + Collaboration

- [ ] Private project: non-granted user is blocked.
- [ ] Access request can be created from blocked state.
- [ ] Creator approves request and requester can access project.
- [ ] Creator changes role viewer -> commenter -> contributor and permissions update accordingly.
- [ ] Expired grant blocks access until renewed.

### Updates + Scheduling

- [ ] Creator saves a draft.
- [ ] Creator schedules draft in the future.
- [ ] At/after schedule time, first read auto-publishes draft.
- [ ] Repeated reads do not republish or duplicate notifications.
- [ ] Non-manager cannot see drafts.

### Notifications

- [ ] Important update fanout respects subscription mode (`all`, `important`, `mute`).
- [ ] Snooze hides scoped notifications but does not hide unrelated types.
- [ ] Digest still groups active notifications correctly.
- [ ] Invite notification deep link opens project when grant is active.
- [ ] Invite deep link fails safely (no crash) after revoke.

### Discovery + Visibility

- [ ] Creator public profile lists only public projects.
- [ ] Explore lists only public projects.
- [ ] Unlisted projects are direct-link accessible but not discoverable.

## Rollback Playbook

Use additive rollback safely and avoid destructive data operations unless required.

### 1) Access System (grants/roles/requests/expiry)

If behavior regresses:

1. Disable newly introduced access paths at route level (return creator-only behavior temporarily).
2. Keep existing grant rows intact; do not mass-delete.
3. Revert API route changes and redeploy.
4. Re-run policy regression tests before re-enabling.

Verification commands:

- `npm run test:unit -- lib/projectAccess.test.ts lib/projectAccessPolicyServer.test.ts lib/projectAccessRequests.test.ts`

### 2) Notifications (digest/snooze/modes/invites)

If notification fanout or routing regresses:

1. Temporarily force instant delivery mode usage in UI/API responses.
2. Keep stored preferences and snoozes; avoid dropping tables.
3. Revert fanout logic changes while preserving payload compatibility.

Verification commands:

- `npm run test:unit -- lib/notificationPreferences.test.ts lib/notificationDigest.test.ts lib/notificationSnooze.test.ts lib/projectSubscriptions.test.ts`

### 3) Updates (drafts/scheduling/autopublish)

If autopublish/notification races regress:

1. Disable autopublish invocation in `GET /api/project-updates` (temporary).
2. Keep explicit publish path enabled.
3. Revert autopublish helper or gate by env flag if needed.

Verification commands:

- `npm run test:unit -- lib/projectUpdates.test.ts lib/projectUpdateAutopublish.test.ts`

## Known Risk Flags

- Concurrency spikes around scheduled publish boundaries.
- Preference/filter interaction edges (`snooze` + `digest` + subscription mode).
- Private access revoke timing with stale notification deep links.
- Fallback compatibility paths for important update heuristics.

## Verification Commands

Run before release:

1. `npm run test:unit`
2. `npm run lint`
3. `npm run build`

Focused regression suite for this release hardening:

- `npm run test:unit -- lib/releaseReadinessRegression.test.ts lib/projectUpdateAutopublish.test.ts lib/projectAccessPolicyServer.test.ts`

## LC1 Results (2026-03-06)

### Verification executed

- Full regression suite: `npm run test:unit` -> pass (`184/184`)
- Production build: `npm run build` -> pass
- Targeted LC smoke regression matrix (local): access, updates, notifications, discovery -> pass (`89/89`)

### Smoke checklist status (local)

- Auth + onboarding: covered by existing auth/onboarding unit flows, no failures observed.
- Visibility (public/unlisted/private): pass in policy + explore/profile checks.
- Access grants/expiry/requests/roles: pass in access/request/policy matrix checks.
- Updates (draft/important/scheduled publish): pass in updates + autopublish + mode checks.
- Notifications (instant/digest/snooze/project modes): pass in digest/snooze/subscription regression checks.
- Explore/recommendations/personalization: pass in explore/recommendation/discovery preference checks.

### Defects from LC1 verification

- `P0`: None
- `P1`: None
- `P2`:
  - `npm run lint` command remains misconfigured with Next.js 16 command semantics (`next lint` path resolution issue). This does not impact runtime correctness but should be addressed in a dedicated lint-remediation PR because enabling ESLint currently reveals broad pre-existing repo warnings/errors.

### Fixed in LC1

- Added release-level cross-system regression coverage to prevent drift across access, update scheduling, notification fanout, and visibility boundaries.
- Added launch runbook/checklist guidance and rollback playbook for access, notifications, and updates.

### Remaining known issues

- Lint command/tooling migration deferred (see `P2` above).
- Existing non-blocking build warnings:
  - `metadataBase` not configured.
  - `baseline-browser-mapping` staleness notice.

### Go / No-Go recommendation

- **Go**, with one caveat: treat lint-tooling cleanup as post-LC follow-up unless release policy requires lint gate in CI.

## RC Finalization Pass (2026-03-06)

### Verification executed

- Full unit suite: `npm run test:unit` -> pass (`184/184`)
- Focused release matrix: `npm run test:unit -- lib/releaseReadinessRegression.test.ts lib/projectUpdateAutopublish.test.ts lib/projectAccessPolicyServer.test.ts` -> pass
- Production build: `npm run build` -> pass
- Lint diagnostics on touched files: pass (no linter errors)

### Screenshot capture

Saved under `docs/release-screenshots/rc-final/`:

- `rc-final-home-desktop-1440x900.png`
- `rc-final-dashboard-desktop-1440x900.png`
- `rc-final-project-detail-desktop-1440x900.png`
- `rc-final-creator-profile-desktop-1440x900.png`
- `rc-final-dashboard-mobile-390x844.png`
- `rc-final-project-detail-mobile-390x844.png`
- `rc-final-notifications-blocked-desktop-1440x900.png`
- `rc-final-notifications-blocked-mobile-390x844.png`

Notes:

- Required desktop/mobile viewport sizes were applied for captured images.
- Notifications panel capture is blocked in this environment without an authenticated dashboard session; blocker evidence was captured via sign-in modal screenshots above.

### Final smoke checklist status

- Auth/onboarding: **Partial** (automated/auth route checks pass in regression suite; full manual authenticated flow blocked by credentials in this environment).
- Visibility/access matrix: **Pass** (policy + access regression suite).
- Updates draft/important/scheduled publish: **Pass** (unit + release regression + autopublish concurrency coverage).
- Notifications (instant/digest/snooze/project modes): **Pass** in automated regression; **manual panel screenshot blocked** by unauthenticated session.
- Explore/recommendations/personalization: **Pass** (explore/recommendation/discovery preference regression suite).

### Defects from RC finalization

- `P0`: None
- `P1`: None
- `P2`:
  - Manual screenshot evidence for authenticated notifications panel remains blocked by unavailable authenticated test session in this environment.
  - Existing non-blocking warnings remain (`metadataBase`, `baseline-browser-mapping` staleness).

### Defects fixed in RC finalization

- None (verification + documentation pass only; no feature or behavior changes).

### Final Go / No-Go recommendation

- **Conditional Go**.
- Runtime quality and regression coverage are release-ready; complete one final authenticated manual screenshot pass for dashboard project detail notifications panel before external signoff if strict visual-evidence gate is required.
