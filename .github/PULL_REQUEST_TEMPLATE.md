<!--
  Thanks for contributing to HQ!
  Please fill in the sections below. Delete any that don't apply.
  See CONTRIBUTING.md for the full rules of the road.
-->

## What

A one-paragraph description of the change. What now exists that didn't?

## Why

What problem does this solve? Link the issue if there is one: `Closes #N`.

## How

Technical notes worth calling out: trade-offs, alternatives considered,
anything a reviewer should know. Skip if the diff speaks for itself.

## Testing

- [ ] New or updated tests accompany the change (see `docs/architecture/TESTING.md`)
- [ ] `pnpm test` passes locally
- [ ] `pnpm typecheck` passes locally
- [ ] Manual verification done (describe what you clicked / what you ran)

## Docs

- [ ] User-visible behavior — updated the relevant `docs/*.md`
- [ ] New env var — added to `.env.example`
- [ ] Breaking change — mentioned in `CHANGELOG.md` under `[Unreleased]`
- [ ] No doc impact

## Breaking change?

- [ ] No
- [ ] Yes — migration notes:

<!--
  If yes, explain what users need to do to upgrade. Schema migrations,
  env var renames, API contract changes, removed features.
-->

## Checklist

- [ ] Branch named `<type>/<slug>` per CONTRIBUTING.md
- [ ] Conventional Commits for commit messages
- [ ] PR is focused on one theme (no drive-by unrelated fixes)
- [ ] Rebased on latest `main`
