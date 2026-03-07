## Project

Zebra is a monorepo (Bun workspaces) for tracking token usage from local AI coding tools.

- `packages/core` — shared TypeScript types (`@zebra/core`, private, zero runtime deps)
- `packages/cli` — CLI tool (`@nocoo/zebra`, published to npm, citty + consola + picocolors)
- `packages/web` — SaaS dashboard (`@zebra/web`, private, Next.js 16 + App Router)

### Supported AI Tools

Claude Code, Codex CLI, Gemini CLI, OpenCode, OpenClaw

### Key Conventions

- **Runtime**: Bun (package manager + runtime)
- **TypeScript**: Strict mode, composite project references
- **Port**: dev=7029, API E2E=17029, BDD E2E=27029
- **Testing**: Four-layer architecture (see docs/01-plan.md)
- **TDD**: Always write tests first, then implement
- **Commits**: Conventional Commits, atomic, auto-commit after changes
- **`@zebra/core` is NOT published**: Pure types, `import type` only, `devDependencies`

## npm Publish Procedure

CLI package `@nocoo/zebra` is published to npm. Steps:

1. **Bump version** — ALL `package.json` files + `packages/cli/src/cli.ts` (`meta.version`)
2. **Build** — `bun install && bun run build`
3. **Test** — `bun run test`
4. **Dry-run** — `npm publish --dry-run` in `packages/cli/`
5. **Publish** — `npm publish` in `packages/cli/`
6. **Verify** — `npx @nocoo/zebra@latest --help`
7. **Commit & push** — Triggers Railway auto-deploy for web
8. **Tag & release** — `git tag vX.Y.Z && git push origin vX.Y.Z`

## Retrospective

(Lessons learned will be recorded here)
