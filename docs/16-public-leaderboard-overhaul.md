# Public Leaderboard & Profile Overhaul

> Restructure the leaderboard as a standalone public page, add an explicit
> privacy toggle (`is_public`), and introduce admin visibility controls.

## Status

| # | Commit | Description | Status |
|---|--------|-------------|--------|
| 1 | `docs: add public leaderboard overhaul plan` | This document | |
| 2 | `feat: add is_public column to users table` | Migration script + `no such column` fallbacks | |
| 3 | `feat: add is_public to settings API` | GET returns `is_public`, PATCH accepts it | |
| 4 | `test: add L1 tests for is_public settings` | Settings API unit tests | |
| 5 | `feat: add is_public toggle to settings page` | Toggle switch in Public Profile section | |
| 6 | `feat: filter leaderboard by is_public` | API uses `is_public = 1` instead of `slug IS NOT NULL` | |
| 7 | `test: update leaderboard tests for is_public` | Updated SQL assertions + new test cases | |
| 8 | `feat: add admin mode to leaderboard API` | `admin=true` param with `resolveAdmin()` guard | |
| 9 | `test: add L1 tests for admin leaderboard` | Admin param tests (authorized + unauthorized) | |
| 10 | `refactor: move leaderboard out of dashboard layout` | `(dashboard)/leaderboard/` → `app/leaderboard/` | |
| 11 | `feat: redesign leaderboard as standalone public page` | New layout matching `/u/[slug]` style | |
| 12 | `feat: add admin toggle to leaderboard page` | `useAdmin()` hook + "Show All" switch on UI | |
| 13 | `feat: gate public profile by is_public` | `/api/users/[slug]` returns 404 when `is_public != 1` | |
| 14 | `test: add L1 tests for public profile is_public gate` | Profile API unit tests | |
| 15 | `feat: update proxy to allow public leaderboard page` | `isPublicRoute` includes `/leaderboard` | |
| 16 | `test: update proxy tests for /leaderboard` | Public route assertions | |
| 17 | `refactor: change default leaderboard limit to 10` | Public default 10, admin default 50 | |

---

## Problem

The current leaderboard and public profile system has three issues:

1. **No explicit privacy control.** Setting a `slug` implicitly makes a user
   visible on the public leaderboard AND creates an accessible profile page at
   `/u/{slug}`. Users cannot have a slug (for team use) without being publicly
   visible.

2. **Leaderboard is inside the dashboard.** The `/leaderboard` page lives in
   the `(dashboard)` route group, which wraps it in `AppShell` (sidebar +
   header). It requires login and looks like an internal tool, not a public
   showcase.

3. **No admin oversight.** Admins cannot see all users on the leaderboard —
   they're subject to the same visibility filter as everyone else.

---

## Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Privacy granularity | Single `is_public` toggle | Simpler UX — "public" means both leaderboard and profile |
| Leaderboard URL | Keep `/leaderboard` | No reason to change; existing links work |
| Leaderboard layout | Standalone (no sidebar) | Matches `/u/[slug]` style; public-first design |
| Dashboard nav link | Keep, links to `/leaderboard` | Logged-in users can still navigate via sidebar |
| Default public limit | 10 entries | Public showcase, not a data dump |
| Admin mechanism | Toggle on page + query param | Lightweight, no new admin page needed |
| Profile 404 on `is_public=0` | Return 404 (not 403) | Don't leak that the user exists but is private |

---

## Schema Change

### `users` table: add `is_public` column

```sql
ALTER TABLE users ADD COLUMN is_public INTEGER NOT NULL DEFAULT 0;
```

- `0` = private (default for all existing users)
- `1` = public (opt-in via settings)

After migration, existing users with a slug are **NOT** automatically public.
They must explicitly enable `is_public` in Settings. This is a breaking change
for anyone currently on the leaderboard — documented in the migration commit.

### Rollback

```sql
-- Safe to drop since default is 0 and no foreign keys reference it
-- D1 does not support DROP COLUMN, so rollback = set all to 0
UPDATE users SET is_public = 0;
```

---

## Commit Details

### Commit 1: `docs: add public leaderboard overhaul plan`

This document.

**Files changed:**
- `docs/16-public-leaderboard-overhaul.md` (new)

---

### Commit 2: `feat: add is_public column to users table`

Create a migration script at `scripts/migrations/005-is-public.sql` and add
`no such column` fallback handling where `is_public` is read.

**Files changed:**
- `scripts/migrations/005-is-public.sql` (new)

**Migration SQL:**

```sql
ALTER TABLE users ADD COLUMN is_public INTEGER NOT NULL DEFAULT 0;
```

**Note:** Must be applied manually to D1 via `wrangler d1 execute` — there is
no automated migration runner. The app code uses `no such column` fallbacks to
degrade gracefully before the migration runs.

---

### Commit 3: `feat: add is_public to settings API`

Update `GET /api/settings` and `PATCH /api/settings` to handle `is_public`.

**Files changed:**
- `packages/web/src/app/api/settings/route.ts`

**GET changes:**
- Add `is_public` to the SELECT query
- `no such column` fallback returns `is_public: false`
- Response type: `{ nickname, slug, is_public }`

**PATCH changes:**
- Accept `is_public` in request body (boolean → stored as 0/1 integer)
- Validate: must be `true` or `false` (or omitted)
- Add `is_public = ?` to the dynamic SET clause
- `no such column` fallback returns 503

**Validation rules:**
```
is_public: boolean (optional)
  - true  → store as 1
  - false → store as 0
  - any other type → 400 "is_public must be a boolean"
```

---

### Commit 4: `test: add L1 tests for is_public settings`

**Files changed:**
- `packages/web/src/__tests__/settings.test.ts` (new or extend existing)

**Test cases:**

```
describe("GET /api/settings")
  ✓ should return is_public in response
  ✓ should return is_public: false in fallback when column missing

describe("PATCH /api/settings — is_public")
  ✓ should accept is_public: true
  ✓ should accept is_public: false
  ✓ should reject non-boolean is_public (string, number)
  ✓ should store true as 1 and false as 0
  ✓ should allow updating is_public together with slug and nickname
```

---

### Commit 5: `feat: add is_public toggle to settings page`

Add a toggle switch to the "Public Profile" section in Settings.

**Files changed:**
- `packages/web/src/app/(dashboard)/settings/page.tsx`

**UI design:**
- New toggle row between the slug input and the Save button
- Label: "Show my profile publicly"
- Description: "When enabled, your profile appears on the leaderboard and is
  accessible at your public URL."
- Toggle component: simple `<button role="switch">` with `aria-checked` — no
  need for a new shadcn component
- State: `isPublic` boolean, initialized from `settings.is_public`
- Included in the PATCH body when changed

**Interaction:**
- Toggle is independent of slug — user can set a slug without going public
- When `is_public` is off, slug input shows a subtle hint: "Set a slug to
  customize your profile URL when you go public."
- When `is_public` is on and slug is empty, show warning: "You need a slug to
  have a public profile URL."

---

### Commit 6: `feat: filter leaderboard by is_public`

Update the leaderboard API to use `is_public` instead of `slug IS NOT NULL`.

**Files changed:**
- `packages/web/src/app/api/leaderboard/route.ts`

**Changes:**

Current public filter:
```sql
WHERE u.slug IS NOT NULL
```

New public filter:
```sql
WHERE u.is_public = 1 AND u.slug IS NOT NULL
```

Both conditions are required:
- `is_public = 1` — user explicitly opted in
- `slug IS NOT NULL` — user has a profile URL (needed for linking)

**`no such column` fallback:** The existing fallback retry mechanism handles
this — if `is_public` column doesn't exist yet, the first query will fail
with `no such column: u.is_public`, and the fallback retries with
`u.slug IS NOT NULL` only (preserving current behavior).

**Team filter:** Unchanged — team leaderboard shows all team members
regardless of `is_public` (team membership implies consent to team visibility).

---

### Commit 7: `test: update leaderboard tests for is_public`

**Files changed:**
- `packages/web/src/__tests__/leaderboard.test.ts`

**Updated test cases:**

```
describe("successful response")
  ✓ should filter by is_public = 1 (updated — was "slug IS NOT NULL")
  ✓ should still require slug IS NOT NULL

describe("nickname fallback")
  ✓ should retry without is_public on 'no such column' (updated)
  ✓ fallback SQL should use slug IS NOT NULL only

describe("team filter")
  ✓ should NOT include is_public filter when team is set (updated)
```

---

### Commit 8: `feat: add admin mode to leaderboard API`

Add `admin=true` query param that bypasses the `is_public` filter.

**Files changed:**
- `packages/web/src/app/api/leaderboard/route.ts`

**Behavior:**
- When `admin=true` is present, call `resolveAdmin(request)` to verify the
  caller is an admin
- If admin verification succeeds: remove `is_public = 1` and
  `slug IS NOT NULL` conditions (show all users)
- If admin verification fails: ignore the param, apply normal public filters
- Admin mode does NOT change the team filter behavior
- Admin mode uses `limit=50` default (not 10)

**New import:**
```typescript
import { resolveAdmin } from "@/lib/admin";
```

**SQL for admin mode:**
```sql
SELECT ... FROM usage_records ur
JOIN users u ON u.id = ur.user_id
WHERE 1=1
  AND ur.hour_start >= ?   -- if period != all
GROUP BY ur.user_id
ORDER BY total_tokens DESC
LIMIT ?
```

---

### Commit 9: `test: add L1 tests for admin leaderboard`

**Files changed:**
- `packages/web/src/__tests__/leaderboard.test.ts`

**New test cases:**

```
describe("admin mode")
  ✓ should show all users when admin=true and caller is admin
  ✓ should NOT include is_public or slug filter in admin SQL
  ✓ should apply normal filters when admin=true but caller is not admin
  ✓ should apply normal filters when admin=true but caller is unauthenticated
  ✓ should use limit=50 default in admin mode
```

**Mock setup:**
- Mock `@/lib/admin` module: `resolveAdmin` returns `{ userId, email }` or
  `null`
- Two helpers: `makeAdminRequest()` (with admin cookie/token) and
  `makeRequest()` (no auth)

---

### Commit 10: `refactor: move leaderboard out of dashboard layout`

Move the leaderboard page from the `(dashboard)` route group to the app root
so it no longer inherits `AppShell` (sidebar + header).

**Files changed:**
- `packages/web/src/app/(dashboard)/leaderboard/page.tsx` (deleted)
- `packages/web/src/app/leaderboard/page.tsx` (new — initially copy, will be
  redesigned in commit 11)

**No functional changes** — same component, just different file location. The
page will briefly render without the dashboard layout (raw content), which is
acceptable since commit 11 immediately follows.

---

### Commit 11: `feat: redesign leaderboard as standalone public page`

Redesign the leaderboard page with its own standalone layout, matching the
style of `/u/[slug]/profile-view.tsx`.

**Files changed:**
- `packages/web/src/app/leaderboard/page.tsx` (rewrite)

**Layout structure:**
```
┌─────────────────────────────────────┐
│ pew ⚡              [period tabs]   │  ← minimal header
├─────────────────────────────────────┤
│                                     │
│          Leaderboard                │  ← title
│   Who's burning the most tokens?    │
│                                     │
│  [This Week] [This Month] [All]     │  ← period tabs (if not in header)
│  [Global] [Team A] [Team B]         │  ← team filter (if teams exist)
│                                     │
│  🏆 1  Alice       3.2M in  1.1M   │
│  🥈 2  Bob         2.1M in  900K   │
│  🥉 3  Charlie     1.8M in  700K   │
│     4  Dave        1.2M in  400K   │
│     ...                             │
│     10 Eve         200K in  100K   │
│                                     │
│         Powered by pew              │  ← footer
└─────────────────────────────────────┘
```

**Features:**
- Minimal top bar: "pew" logo + zap icon (same as profile page)
- Period tabs and team filter (same functionality as current page)
- Leaderboard rows (same component, maybe refined)
- Footer: "Powered by pew"
- Responsive — works on mobile
- No login required
- Clicking a user name → `/u/{slug}` (if slug exists)

**Team filter behavior:**
- If the viewer is logged in, fetch `/api/teams` to show their teams
- If not logged in, only show "Global" (no team filter)

---

### Commit 12: `feat: add admin toggle to leaderboard page`

Add an admin-only "Show All Users" toggle to the leaderboard page.

**Files changed:**
- `packages/web/src/app/leaderboard/page.tsx`

**Behavior:**
- Use `useAdmin()` hook to detect admin status
- When admin: show a small toggle/switch labeled "Show All" in the controls row
- Toggle state is passed as `admin=true` query param to the API
- Non-admin users never see this toggle
- Visual indicator: rows without `is_public` show a subtle "hidden" badge

---

### Commit 13: `feat: gate public profile by is_public`

Update the public profile API to check `is_public` before returning data.

**Files changed:**
- `packages/web/src/app/api/users/[slug]/route.ts`

**Changes:**

Current user lookup:
```sql
SELECT id, name, image, slug, created_at FROM users WHERE slug = ?
```

New user lookup:
```sql
SELECT id, name, image, slug, created_at, is_public FROM users WHERE slug = ?
```

After lookup:
```typescript
// Return 404 if user is not public (don't leak existence)
if (!user.is_public) {
  return NextResponse.json({ error: "User not found" }, { status: 404 });
}
```

**`no such column` fallback:** If `is_public` column doesn't exist, catch the
error and retry without it (preserving current behavior — all users with slugs
are visible).

---

### Commit 14: `test: add L1 tests for public profile is_public gate`

**Files changed:**
- `packages/web/src/__tests__/public-profile.test.ts` (new)

**Test cases:**

```
describe("GET /api/users/[slug]")
  ✓ should return profile when user is_public = 1
  ✓ should return 404 when user is_public = 0
  ✓ should return 404 when user not found
  ✓ should fall back to showing profile when is_public column missing
```

---

### Commit 15: `feat: update proxy to allow public leaderboard page`

Update `isPublicRoute()` to include the `/leaderboard` page route.

**Files changed:**
- `packages/web/src/proxy.ts`

**Change:**

```typescript
export function isPublicRoute(pathname: string): boolean {
  return (
    pathname.startsWith("/api/auth") ||
    pathname.startsWith("/api/ingest") ||
    pathname.startsWith("/api/users/") ||
    pathname.startsWith("/api/leaderboard") ||
    pathname.startsWith("/u/") ||
    pathname.startsWith("/leaderboard")    // ← new
  );
}
```

**Note:** `/api/leaderboard` is already public (handled by proxy matcher
exclusion), but the page route `/leaderboard` is currently intercepted by the
proxy and redirects unauthenticated users to `/login`. This commit fixes that.

---

### Commit 16: `test: update proxy tests for /leaderboard`

**Files changed:**
- `packages/web/src/__tests__/proxy.test.ts`

**Changes:**
- Move `/leaderboard` from the "protected route" test list to the "public
  route" test list
- Update `resolveProxyAction` test: unauthenticated user on `/leaderboard`
  should get `"next"` instead of `"redirect:/login"`

```
describe("isPublicRoute")
  ✓ /leaderboard → true (was false)

describe("resolveProxyAction")
  ✓ unauthenticated user on /leaderboard → "next" (was "redirect:/login")
```

---

### Commit 17: `refactor: change default leaderboard limit to 10`

**Files changed:**
- `packages/web/src/app/api/leaderboard/route.ts`

**Changes:**
- `DEFAULT_LIMIT` from `50` → `10` for public requests
- Admin requests default to `50`
- `MAX_LIMIT` stays at `100`
- Update the `useLeaderboard` hook default if needed

**Rationale:** Public leaderboard is a showcase (top 10), not a comprehensive
data export. Admin mode retains the higher default for operational oversight.

---

## Test Plan Summary

### L1 Unit Tests (mocked D1, no network)

| File | Coverage |
|------|----------|
| `settings.test.ts` | `is_public` GET/PATCH validation + storage |
| `leaderboard.test.ts` | `is_public` filter, admin bypass, default limit, fallbacks |
| `public-profile.test.ts` | `is_public` gate, 404 behavior, column fallback |
| `proxy.test.ts` | `/leaderboard` public route + proxy action |

### Manual Verification

After deployment:

1. **New user flow:** Sign up → Settings shows `is_public: false` → Not on
   leaderboard → Enable toggle → Appears on leaderboard
2. **Existing user regression:** Users with slugs disappear from leaderboard
   after migration (expected — they must re-opt-in)
3. **Public access:** Open `/leaderboard` in incognito → page loads without
   login
4. **Admin toggle:** Admin opens `/leaderboard` → sees "Show All" toggle →
   enable → sees all users including private ones
5. **Profile gate:** Navigate to `/u/{slug}` for a private user → 404
6. **Profile access:** Navigate to `/u/{slug}` for a public user → profile
   loads

---

## Migration Notes

### Breaking Change

After deploying commit 6 and running the migration, **all existing users will
disappear from the public leaderboard** because `is_public` defaults to `0`.
Users must visit Settings and enable the toggle to reappear.

**Mitigation options:**
- (a) Announce via in-app banner before migration
- (b) Auto-set `is_public = 1` for users who already have a slug:
  ```sql
  UPDATE users SET is_public = 1 WHERE slug IS NOT NULL;
  ```
- (c) Accept the reset — it's a small user base in closed beta

### Deploy Order

1. Deploy code (commits 2-17) — all `no such column` fallbacks ensure the app
   works without the migration
2. Run migration: `wrangler d1 execute pew-prod --command "ALTER TABLE users ADD COLUMN is_public INTEGER NOT NULL DEFAULT 0;"`
3. Optionally run: `UPDATE users SET is_public = 1 WHERE slug IS NOT NULL;`
4. Verify via admin leaderboard toggle
