# Security policy

## Supported versions

| Version | Supported |
| --- | --- |
| 0.3.x   | ✅ |
| 0.2.x   | ❌ — upgrade to 0.3.x |
| < 0.2   | ❌ |

Only the latest minor release receives security updates.

## Reporting a vulnerability

**Please do not open a public issue for security vulnerabilities.**

Email `security@aiwahlabs.com` with:

- A description of the vulnerability.
- The affected version(s) or commit SHA.
- Steps to reproduce (proof of concept preferred).
- Your assessment of impact.
- A contact address we can reach you at.

### What to expect

- **Acknowledgment** within 2 business days.
- **Triage + severity assessment** within 5 business days.
- **Fix timeline** depending on severity:
  - Critical: emergency patch within 7 days.
  - High: patch in the next minor release.
  - Medium / Low: folded into the following release.
- **Credit**: with your permission, we'll credit you in the release
  notes and CHANGELOG. We're happy to coordinate disclosure.

### Scope

In scope:

- Authentication bypass, privilege escalation.
- Data exposure via API, MCP, or Workshop.
- Injection (SQL, command, template, etc.).
- SSRF, path traversal, arbitrary file read/write.
- Dependency vulnerabilities with a practical exploit path.

Out of scope:

- Issues that require physical access to the server or database.
- Denial of service via resource exhaustion on a self-hosted install
  (operator responsibility; we still want to know if it's trivial).
- Social engineering, phishing.
- Findings against a running instance you don't own.
- Version-disclosure headers or banner grabs.

## Operational recommendations

HQ is self-hosted. Security also depends on how you run it:

- **Rotate `SESSION_SECRET` and `INTERNAL_API_SECRET`** when you hand
  over a deployment or suspect compromise.
- **Pin the Docker image / node version** — don't track `latest`.
- **Restrict storage bucket access** — the S3 driver uses presigned
  URLs; bucket policy should deny public read by default.
- **Audit the approval queue** — high-risk actions should require
  approval; don't grant bots `approvals.bypass` casually.
- **Keep `DATABASE_URL` off shared environments.** HQ's backup/restore
  flow (see `docs/operations/backup-restore.md`) assumes the database
  is treated as sensitive.

Questions about hardening a deployment are welcome on the issue tracker
with the `question` label — unlike vulnerability reports, those are
fine to discuss in public.
