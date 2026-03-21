# 30 — Quality System Upgrade (L1+L2+L3+G1+G2)

> Upgrade from legacy "four-layer test architecture" to "quality system: three test layers + two gates".

## Background

### Old System (Four-Layer Test Architecture)

| Layer | Name | Trigger |
|-------|------|---------|
| L1 | Unit Tests (≥90%) | pre-commit |
| L2 | Lint (tsc + ESLint) | pre-commit |
| L3 | API E2E (real HTTP) | pre-push |
| L4 | BDD E2E (Playwright) | manual/CI |

### New System (Quality System)

| Layer | Name | What it validates | Trigger |
|-------|------|-------------------|---------|
| **L1** | Unit/Component | Logic units, pure functions, hooks, ViewModels | pre-commit (<30s) |
| **L2** | Integration/API | Real HTTP calls, DB interactions, cross-module | pre-push (<3min) |
| **L3** | System/E2E | End-to-end user flows via Playwright | CI / manual |
| **G1** | Static Analysis | tsc strict + ESLint strict, 0 errors + 0 warnings | pre-commit |
| **G2** | Security/Perf | osv-scanner (dependency CVEs) + gitleaks (secret leak) | pre-push |

### Key Changes

1. **Lint demoted**: L2 Lint → G1 gate (it validates *conventions*, not *behavior*)
2. **L3/L4 merged**: Old API E2E + BDD E2E → new L2 Integration + L3 System
3. **G2 added**: Security scanning — was completely absent

---

## Gap Analysis

Audit date: 2026-03-22. Test count: 2,178 (127 files). Coverage: 93.7%.

| Requirement | Current State | Gap | Action |
|------------|--------------|-----|--------|
| L1 Unit ≥90%, pre-commit | ✅ 2,178 tests, 90% threshold enforced in `vitest.config.ts` | None | — |
| L2 Integration/API, pre-push | ✅ `scripts/run-e2e.ts` launches real Next.js server on :17030 | None | — |
| L3 System/E2E (Playwright) | ❌ Runner `scripts/run-e2e-ui.ts` exists, 0 actual specs, Playwright not installed | Full layer missing | Commits 4–5 |
| G1 `--max-warnings=0` | ⚠️ ESLint strict preset but no `--max-warnings=0` flag | Warnings silently pass | Commit 2 |
| G1 `.skip`/`.only` ban | ❌ Test files can commit `.skip`/`.only` without error | Accidental debug leaks | Commit 2 |
| G2 osv-scanner | ❌ Not configured | No CVE scanning | Commit 3 |
| G2 gitleaks | ❌ Not configured | No secret scanning | Commit 3 |
| Hook comments | References "four-layer test architecture" | Stale naming | Commit 6 |
| CLAUDE.md | References "Four-layer architecture" | Stale naming | Commit 7 |

---

## Hook Mapping (Target State)

```
pre-commit (<30s):
  ├── L1: bun run test:coverage  (vitest + coverage-v8, threshold 90%)
  └── G1: bun run lint           (tsc --noEmit ×5 + eslint --max-warnings=0)

pre-push (<3min):
  ├── L2: bun run test:e2e       (scripts/run-e2e.ts → real HTTP on :17030)
  └── G2: bun run test:security  (osv-scanner + gitleaks)

CI / manual:
  └── L3: bun run test:e2e:ui    (scripts/run-e2e-ui.ts → Playwright on :27030)
```

---

## Implementation — 8 Atomic Commits

### Commit 1: `docs: add quality system upgrade plan (doc 30)`

Create this document. Update `docs/README.md` index.

**Files**:
- `docs/30-quality-system-upgrade.md` (new)
- `docs/README.md` (add row)

---

### Commit 2: `chore: upgrade G1 eslint to --max-warnings=0 and ban .skip/.only`

**`package.json`** — lint script change:
```diff
- "lint": "... && eslint .",
+ "lint": "... && eslint . --max-warnings=0",
```

**`eslint.config.ts`** — add to test files block:
```ts
"no-restricted-syntax": [
  "error",
  {
    selector: "MemberExpression[property.name='skip']",
    message: "Do not commit .skip tests — remove before committing",
  },
  {
    selector: "MemberExpression[property.name='only']",
    message: "Do not commit .only tests — remove before committing",
  },
],
```

**Verify**: `bun run lint` → 0 errors, 0 warnings.

**Files**:
- `package.json`
- `eslint.config.ts`

---

### Commit 3: `chore: add G2 security gate (osv-scanner + gitleaks)`

**Prerequisites** (one-time manual install):
```bash
brew install osv-scanner gitleaks
```

**`package.json`** — add script:
```json
"test:security": "osv-scanner --lockfile=bun.lock && gitleaks protect --staged --no-banner"
```

**`.husky/pre-push`** — append G2 block after L2:
```bash
# G2: Security — osv-scanner (dependency CVEs) + gitleaks (secret leak)
if command -v osv-scanner >/dev/null 2>&1; then
  osv-scanner --lockfile=bun.lock 2>&1
  OSV_EXIT=$?
  if [ $OSV_EXIT -ne 0 ]; then
    echo "❌ pre-push FAILED: osv-scanner found vulnerabilities."
    exit 1
  fi
fi

if command -v gitleaks >/dev/null 2>&1; then
  gitleaks protect --staged --no-banner 2>&1
  GITLEAKS_EXIT=$?
  if [ $GITLEAKS_EXIT -ne 0 ]; then
    echo "❌ pre-push FAILED: gitleaks found secrets."
    exit 1
  fi
fi
```

Uses `command -v` guard so the hook doesn't fail on CI or machines without the tools.

**Verify**: `bun run test:security` → clean.

**Files**:
- `package.json`
- `.husky/pre-push`

---

### Commit 4: `test: install playwright and configure for L3 E2E`

```bash
bun add -d @playwright/test
npx playwright install chromium
```

**`playwright.config.ts`** (new, project root):
```ts
import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "packages/web/e2e",
  timeout: 30_000,
  retries: 0,
  use: {
    baseURL: "http://localhost:27030",
    headless: true,
  },
  webServer: {
    command: "E2E_SKIP_AUTH=1 NEXT_DIST_DIR=.next-e2e PORT=27030 bun run --cwd packages/web dev",
    port: 27030,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
```

**`packages/web/e2e/smoke.spec.ts`** (new):
```ts
import { test, expect } from "@playwright/test";

test("app loads and shows page title", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveTitle(/pew/i);
});
```

**Verify**: `bunx playwright test` → 1 spec passes.

**Files**:
- `package.json` (dep added)
- `bun.lock`
- `playwright.config.ts` (new)
- `packages/web/e2e/smoke.spec.ts` (new)
- Add to `.gitignore`: `playwright-report/`, `test-results/`

---

### Commit 5: `test: add L3 playwright core flow specs`

Core user journeys:

**`packages/web/e2e/auth.spec.ts`**:
- Login page renders (`/login` accessible)
- Unauthenticated redirect works (visiting `/` redirects to `/login`)

**`packages/web/e2e/dashboard.spec.ts`**:
- Dashboard loads after auth bypass
- Token usage chart container is visible
- At least one data card is rendered

**`packages/web/e2e/navigation.spec.ts`**:
- Sidebar links are present (Dashboard, Leaderboard, Settings)
- Clicking a sidebar link navigates to the correct page

**Files**:
- `packages/web/e2e/auth.spec.ts` (new)
- `packages/web/e2e/dashboard.spec.ts` (new)
- `packages/web/e2e/navigation.spec.ts` (new)

---

### Commit 6: `chore: update husky hooks to new quality system naming`

**`.husky/pre-commit`** — comment updates:
```diff
- # pre-commit: L1 Unit Tests + Coverage + L2 Lint (four-layer test architecture)
+ # pre-commit: L1 Unit/Component + G1 Static Analysis (quality system)

- # L1: Unit Tests + Coverage (90% threshold enforced by vitest.config.ts)
+ # L1 Unit/Component: coverage ≥90% enforced by vitest.config.ts

- # L2: Lint (TypeScript strict type checking + ESLint)
+ # G1 Static Analysis: tsc strict + ESLint strict (0 errors + 0 warnings)

- echo "✅ pre-commit passed: L1 UT + Coverage ≥90% + L2 Lint"
+ echo "✅ pre-commit passed: L1 Unit ≥90% + G1 Static Analysis"
```

**`.husky/pre-push`** — comment updates:
```diff
- # pre-push: L3 API E2E Tests (four-layer test architecture)
- # L1+L2 already enforced by pre-commit.
+ # pre-push: L2 Integration/API + G2 Security (quality system)
+ # L1+G1 already enforced by pre-commit.

- echo "✅ pre-push passed: L3 API E2E"
+ echo "✅ pre-push passed: L2 Integration/API + G2 Security"
```

**Files**:
- `.husky/pre-commit`
- `.husky/pre-push`

---

### Commit 7: `docs: update CLAUDE.md to reference new quality system`

In `CLAUDE.md` → Key Conventions → Testing:

```diff
- **Testing**: Vitest is the sole test runner for L1 unit tests (`bun run test`).
- Never use `bun test` directly for unit tests ... Four-layer architecture (see docs/01-plan.md)
+ **Testing**: Quality system — L1 Unit + L2 Integration + L3 System/E2E + G1 Static Analysis + G2 Security.
+ Vitest for L1 (`bun run test`), real HTTP E2E for L2 (`bun run test:e2e`),
+ Playwright for L3 (`bun run test:e2e:ui`). See docs/30-quality-system-upgrade.md.
+ Never use `bun test` directly for unit tests ...
```

**Files**:
- `CLAUDE.md`

---

### Commit 8: `docs: finalize doc 30 with verification record`

Append a "Verification Record" section to this document with actual results:
- L1: test count, coverage %
- L2: API E2E pass/fail
- L3: Playwright spec count and pass/fail
- G1: lint 0 errors + 0 warnings
- G2: osv-scanner clean, gitleaks clean

**Files**:
- `docs/30-quality-system-upgrade.md`

---

## Verification Checklist

```bash
# L1 Unit/Component
bun run test:coverage            # ≥2,178 tests pass, coverage ≥90%

# G1 Static Analysis
bun run lint                     # 0 errors + 0 warnings

# L2 Integration/API
bun run test:e2e                 # API E2E pass

# G2 Security
bun run test:security            # osv-scanner + gitleaks clean

# L3 System/E2E
bun run test:e2e:ui              # Playwright specs pass

# Hook dry-runs
sh .husky/pre-commit             # L1+G1 pass
sh .husky/pre-push               # L2+G2 pass
```

---

## Verification Record

> Filled after all commits are applied. See commit 8.
