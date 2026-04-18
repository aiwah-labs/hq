# Backup & Restore

Everything the template stores lives in one of three places:

| Where                | Contents                                              | Backup mechanism                |
| -------------------- | ----------------------------------------------------- | ------------------------------- |
| Postgres             | Objects, users, sessions, integrations, jobs, audit   | `pg_dump` / `pg_restore`        |
| Filesystem (optional) | Uploaded files, if you're using `@hq/storage`        | Filesystem copy or S3 versioning |
| Environment          | Secrets (`DATABASE_URL`, OAuth client secrets, …)     | Secrets manager or encrypted vault |

A restorable backup captures **all three**. A Postgres dump without the
matching `INTEGRATION_ENCRYPTION_KEY` leaves credentials unreadable.

## Postgres

### Local dev

```bash
# Dump
pg_dump $DATABASE_URL --format=custom --file=hq-$(date +%Y%m%d).dump

# Restore (into an empty database)
createdb hq_restored
pg_restore --dbname=hq_restored --clean --if-exists hq-20260418.dump
```

### Production

A common pattern is a nightly cron that runs `pg_dump` to S3:

```bash
pg_dump $DATABASE_URL --format=custom \
  | aws s3 cp - s3://your-bucket/hq/hq-$(date +%Y%m%d).dump
```

Keep at least 7 daily + 4 weekly snapshots. Many managed Postgres
providers (Neon, Supabase, RDS, Cloud SQL) offer point-in-time recovery
out of the box — use it instead of rolling your own cron.

### Before restoring to a new host

- Run **migrations on the restored DB first**: `pnpm prisma migrate deploy`.
  A `pg_dump` does NOT replay migrations; the dump captures the schema at
  backup time, but the `_prisma_migrations` table in it is what `migrate
  deploy` uses to know what has already run. New migrations introduced
  between the backup and now will apply cleanly.
- **Set `INTEGRATION_ENCRYPTION_KEY`** to the same value that was in use
  when the backup was taken. Rotate via `INTEGRATION_ENCRYPTION_KEY_PREV`
  after the restore if you want to re-encrypt under a new key.
- Reissue any `SESSION_SECRET` only if you want to invalidate all active
  sessions.

## Uploaded files

If `@hq/storage` is wired up with a local driver (for self-hosted setups),
back up its root directory alongside the Postgres dump:

```bash
tar czf files-$(date +%Y%m%d).tgz -C /var/lib/hq uploads
```

If using an S3-compatible backend, enable bucket versioning and replication
instead — the template stores only the keys in Postgres, not the file
bytes themselves.

## Secrets

Back up `.env.production` (or your secrets-manager export) in the same
vault as the database credentials. The minimum set required to restore
a working instance:

```
DATABASE_URL=
SESSION_SECRET=
AUTH_OIDC_*=            # if SSO is on
INTEGRATION_ENCRYPTION_KEY=
INTEGRATION_ENCRYPTION_KEY_PREV=  # only during rotation
```

Never commit these to git. Never paste them into AI tools or chat
transcripts.

## Export-based backup (partial)

For a human-readable export of specific objects, use the built-in export:

```bash
curl -u "<api-key>:" "https://your-host/v1/objects/Project/export?format=json" \
  > projects-$(date +%Y%m%d).json
```

This is **not** a full backup — it skips fields not visible in the export,
excludes associations, and does not round-trip relations. Use it for
archival copies of individual object types.

## Disaster-recovery rehearsal

Restores are worth rehearsing:

1. Spin up an empty Postgres.
2. Restore the latest dump.
3. `pnpm prisma migrate deploy`.
4. Point a local Workshop at the restored DB with the matching
   `INTEGRATION_ENCRYPTION_KEY`.
5. Verify: log in, open an integration, confirm credentials decrypt.

Do this at least quarterly — the first time you learn a dump is unusable
should not be the day you need it.
