---
name: Bug report
about: Something doesn't work the way the docs say it should
title: "[bug] "
labels: bug
assignees: ''
---

<!--
  Thanks for filing a bug. Please fill in the sections below.
  If this is a security issue, DO NOT file it here —
  see SECURITY.md and email security@aiwahlabs.com.
-->

## What happened

A clear description of the bug. Include the error message if there is
one, as plain text (not a screenshot if you can avoid it).

## What you expected

What the docs, UI, or API contract suggested should happen.

## Reproduction

Minimal, deterministic steps. A curl command, a file diff, a clicked
path through Workshop — whatever proves the bug.

```
1. ...
2. ...
3. ...
```

## Environment

- HQ version / commit: `v0.3.0` or `git rev-parse --short HEAD`
- Node: `node --version`
- pnpm: `pnpm --version`
- OS: macOS 14 / Ubuntu 24.04 / …
- Deployment: local dev / Docker / bare metal / …
- Postgres version:
- Storage driver: `local` / `s3` / `r2` / …

## `pnpm doctor` output

Paste the output of `pnpm doctor` (redact anything sensitive).

## Logs

Relevant API, Workshop, or Postgres logs around the failure. Redact
secrets.

## Anything else

Workarounds you tried, related issues, hypotheses.
