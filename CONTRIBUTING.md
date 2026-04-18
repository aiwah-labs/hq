# Contributing to HQ

Thank you for your interest in HQ. This document explains how to get set up,
how we expect changes to be structured, and how to get a PR merged.

HQ is a **template**. It's meant to be forked and adapted. Contributions that
make the template more useful, more correct, or more ergonomic are welcome.
Contributions that drag it toward being a specific SaaS product are generally
not.

## Before you start

1. **Search existing issues** before opening a new one — your question may
   already be answered.
2. **For anything non-trivial, open an issue first.** A quick "here's what I
   want to do, is this a fit?" saves both sides a lot of time.
3. **Read the license.** HQ is MIT. Contributions are made under the same
   license.

## Development setup

```bash
git clone https://github.com/aiwah-labs/hq
cd hq
pnpm install
pnpm db:local:bootstrap
pnpm dev:platform
```

Requirements:

- Node.js 22+
- pnpm 10+
- Docker (for the local Postgres container)

Run `pnpm doctor` at any point to check your environment.

## Branch + PR conventions

- **Branch from `main`.** We don't use a long-lived `develop`.
- **Name your branch** as `<type>/<short-slug>`:
  - `feat/invoice-aging-report`
  - `fix/approval-queue-race`
  - `docs/files-storage-drivers`
  - `refactor/action-dispatcher-seams`
  - `release/v0.4.0` (maintainers only)
- **Keep PRs focused.** One theme per PR. Unrelated drive-by fixes
  belong in separate PRs.
- **Use [Conventional Commits](https://www.conventionalcommits.org/)**
  for commit messages:
  - `feat(objects): add ref field type`
  - `fix(auth): reject expired oidc nonce`
  - `docs(workflows): clarify forEach semantics`
  - `test(files): cover presigned upload expiry`
  - `chore(deps): bump prisma to 5.20`
- **Rebase, don't merge `main` into your branch.** Keeps history linear.

## Tests are mandatory

Every code change that touches `shared/` or `apps/api/` must include tests.

- New service function → unit test with mocked DB covering happy path,
  auth denial, and error path.
- New API route → Fastify `inject` test verifying auth enforcement
  (401/403), input validation (400), and not-found (404).
- New workflow node type → executor test via the existing mock harness.
- Bug fix → add a test that fails without the fix and passes with it.

**Non-negotiables:**

1. Auth is tested on every route. Verify `requireAuth` is called with
   the correct scope. Test the 401 rejection path.
2. Error handlers match production — never test-only. Use
   `inferStatusFromError` from `apps/api/src/lib/errors.ts`.
3. Test denial, not just approval. If code checks a permission, test a
   principal that lacks it.
4. Side effects are ordered. If code writes to DB then emits an event,
   verify the event is NOT emitted when the write fails.

Run the full suite before pushing:

```bash
pnpm test
pnpm typecheck
```

## Docs stay current

If your change affects user-visible behavior, update the relevant doc in
the same PR. Reviewers will bounce PRs that leave docs stale.

| If you changed… | Update… |
| --- | --- |
| An object's field-type semantics | `docs/objects.md` |
| Action authoring conventions | `docs/actions.md` |
| Workflow executor behavior | `docs/workflows.md` |
| Event emission rules | `docs/events.md` |
| Agent governance rules | `docs/agents.md` |
| MCP surface | `docs/mcp.md` |
| Storage adapter interface | `docs/files.md` |
| Integration contract | `docs/integrations.md` |
| Permission vocabulary | `docs/permissions.md` |
| SSO/identity flow | `docs/identity.md` / `docs/sso.md` |
| Any user-visible flag or env var | `.env.example` + the doc that mentions it |

## Style

- **TypeScript strict mode.** No `any` without a comment explaining why.
- **Zod at boundaries.** Inputs from HTTP, env, CLI, and webhooks get
  parsed before they enter the service layer.
- **Side-effect registration.** New objects/actions/workflows/agents land
  via an `import` line in the module's index. No plugin system.
- **Comments explain WHY, not WHAT.** Well-named identifiers should
  remove the need for most comments.
- **No unrequested abstractions.** Three similar lines is better than a
  premature abstraction.

## Reviewing and merging

- PRs need at least one approving review from a maintainer.
- CI must be green: `pnpm test`, `pnpm typecheck`, and any lint steps.
- We prefer **squash merges** for multi-commit PRs. The squash commit
  message follows Conventional Commits and references the PR number.

## Security issues

Don't open a public issue for security vulnerabilities. See
[SECURITY.md](SECURITY.md) for the private reporting process.

## Conduct

By participating, you agree to abide by the
[Contributor Covenant v2.1](https://www.contributor-covenant.org/version/2/1/code_of_conduct/).
Be kind. Assume good faith. Debate ideas, not people.

## Questions

- **Docs:** start at [`docs/README.md`](docs/README.md).
- **Building on HQ:** [`docs/building-with-hq.md`](docs/building-with-hq.md).
- **Discussion / help:** GitHub Discussions or the issue tracker.

Thank you for contributing. The template gets better every time someone
fixes a paper cut they noticed on the way through.
