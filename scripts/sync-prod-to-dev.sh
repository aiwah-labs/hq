#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OS_NAME="$(uname -s)"

POSTGRES_FORMULA="${POSTGRES_FORMULA:-postgresql@16}"

PROD_SSH_HOST="${AIWAH_PROD_SSH_HOST:-root@76.13.241.77}"
PROD_POSTGRES_CONTAINER="${AIWAH_PROD_POSTGRES_CONTAINER:-aiwah-postgres-prod}"

DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5432}"
DB_NAME="${DB_NAME:-aiwah_dev}"
DB_USER="${DB_USER:-aiwah}"
DB_PASSWORD="${DB_PASSWORD:-aiwah_dev}"
DB_SCHEMA="${DB_SCHEMA:-public}"

SEED_EMAIL="${SEED_EMAIL:-aiwahlabs@gmail.com}"
SEED_PASSWORD="${SEED_PASSWORD:-Tempura@2026}"
SUPERADMIN_EMAIL_ALLOWLIST="${SUPERADMIN_EMAIL_ALLOWLIST:-aiwahlabs@gmail.com}"

SYNC_DIR="${AIWAH_DB_SYNC_DIR:-${ROOT_DIR}/.cache/db-sync}"
KEEP_DUMP="${AIWAH_DB_SYNC_KEEP_DUMP:-0}"
BACKUP_LOCAL="${AIWAH_DB_SYNC_BACKUP_LOCAL:-1}"
APPLY_LOCAL_MIGRATIONS="${AIWAH_DB_SYNC_APPLY_LOCAL_MIGRATIONS:-1}"
ENSURE_BOOTSTRAP_USER="${AIWAH_DB_SYNC_ENSURE_BOOTSTRAP_USER:-1}"

DATABASE_URL="postgresql://${DB_USER}:${DB_PASSWORD}@${DB_HOST}:${DB_PORT}/${DB_NAME}?schema=${DB_SCHEMA}"
COMMAND="${1:-pull}"

usage() {
  cat <<'EOF'
Usage: ./scripts/sync-prod-to-dev.sh [pull|doctor]

Commands:
  pull    Pull the latest prod DB over SSH and restore it into the local dev DB
  doctor  Check SSH, remote container access, and local Postgres prerequisites

Environment overrides:
  AIWAH_PROD_SSH_HOST              SSH target for the prod host
  AIWAH_PROD_POSTGRES_CONTAINER    Prod Postgres container name
  AIWAH_DB_SYNC_DIR                Local directory for dumps/backups
  AIWAH_DB_SYNC_KEEP_DUMP          Keep the downloaded prod dump (1/0)
  AIWAH_DB_SYNC_BACKUP_LOCAL       Backup local DB before overwrite (1/0)
  AIWAH_DB_SYNC_APPLY_LOCAL_MIGRATIONS
  AIWAH_DB_SYNC_ENSURE_BOOTSTRAP_USER
  DB_HOST / DB_PORT / DB_NAME / DB_USER / DB_PASSWORD / DB_SCHEMA
EOF
}

log() {
  echo "[sync-prod-to-dev] $*"
}

require_command() {
  local cmd="$1"
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "Missing required command: $cmd" >&2
    exit 1
  fi
}

ensure_local_pg_bin() {
  if command -v psql >/dev/null 2>&1 && command -v pg_dump >/dev/null 2>&1; then
    return
  fi

  if [ "$OS_NAME" = "Darwin" ] && [ -d "/opt/homebrew/opt/${POSTGRES_FORMULA}/bin" ]; then
    export PATH="/opt/homebrew/opt/${POSTGRES_FORMULA}/bin:$PATH"
  fi

  require_command psql
  require_command pg_dump
}

run_admin_psql() {
  case "$OS_NAME" in
    Darwin)
      psql -h "$DB_HOST" -p "$DB_PORT" -d postgres "$@"
      ;;
    Linux)
      sudo -u postgres psql -d postgres "$@"
      ;;
    *)
      echo "Unsupported OS: $OS_NAME" >&2
      exit 1
      ;;
  esac
}

run_local_psql() {
  PGPASSWORD="$DB_PASSWORD" \
    psql -v ON_ERROR_STOP=1 -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" "$@"
}

run_local_pg_dump() {
  PGPASSWORD="$DB_PASSWORD" \
    pg_dump -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" "$@"
}

run_remote_prod_dump() {
  ssh -o BatchMode=yes -o ConnectTimeout=10 "$PROD_SSH_HOST" \
    "docker exec -i ${PROD_POSTGRES_CONTAINER} sh -lc 'PGPASSWORD=\"\$POSTGRES_PASSWORD\" exec pg_dump -U \"\$POSTGRES_USER\" -d \"\$POSTGRES_DB\" --clean --if-exists --no-owner --no-privileges'"
}

prepare_local_database() {
  "$ROOT_DIR/scripts/local-postgres.sh" start
  "$ROOT_DIR/scripts/local-postgres.sh" init
  "$ROOT_DIR/scripts/local-postgres.sh" write-env
}

backup_local_database() {
  local backup_file="$1"

  if [ "$BACKUP_LOCAL" != "1" ]; then
    log "Skipping local backup."
    return
  fi

  log "Backing up local DB to ${backup_file}"
  run_local_pg_dump --clean --if-exists --no-owner --no-privileges >"$backup_file"
  log "Local backup size: $(wc -c <"$backup_file" | xargs) bytes"
}

reset_local_database() {
  log "Resetting local database ${DB_NAME}"
  run_admin_psql -v ON_ERROR_STOP=1 <<SQL
SELECT pg_terminate_backend(pid)
FROM pg_stat_activity
WHERE datname = '${DB_NAME}'
  AND pid <> pg_backend_pid();
DROP DATABASE IF EXISTS "${DB_NAME}";
CREATE DATABASE "${DB_NAME}" OWNER "${DB_USER}";
SQL
}

restore_prod_dump() {
  local dump_file="$1"

  log "Restoring prod dump into local DB ${DB_NAME}"
  run_local_psql <"$dump_file"
}

apply_local_migrations() {
  if [ "$APPLY_LOCAL_MIGRATIONS" != "1" ]; then
    log "Skipping local migrations."
    return
  fi

  log "Applying local migrations on top of restored prod data"
  (
    cd "$ROOT_DIR"
    export DATABASE_URL
    pnpm db:migrate:prod
  )
}

ensure_local_bootstrap_user() {
  if [ "$ENSURE_BOOTSTRAP_USER" != "1" ]; then
    log "Skipping bootstrap user sync."
    return
  fi

  log "Ensuring local bootstrap user exists after restore"
  (
    cd "$ROOT_DIR"
    export DATABASE_URL NODE_ENV=development SEED_EMAIL SEED_PASSWORD SUPERADMIN_EMAIL_ALLOWLIST
    pnpm db:seed
  )
}

print_table_counts() {
  log "Key table counts in local DB"
  run_local_psql -c "
SELECT 'users' AS table_name, count(*) FROM \"User\"
UNION ALL SELECT 'content', count(*) FROM \"Content\"
UNION ALL SELECT 'bots', count(*) FROM \"Bot\"
UNION ALL SELECT 'crm_companies', count(*) FROM \"CrmCompany\"
UNION ALL SELECT 'crm_contacts', count(*) FROM \"CrmContact\"
ORDER BY table_name;
"
}

doctor() {
  require_command ssh
  ensure_local_pg_bin

  log "Checking SSH access to ${PROD_SSH_HOST}"
  ssh -o BatchMode=yes -o ConnectTimeout=10 "$PROD_SSH_HOST" true

  log "Checking prod container ${PROD_POSTGRES_CONTAINER}"
  ssh -o BatchMode=yes -o ConnectTimeout=10 "$PROD_SSH_HOST" \
    "docker ps --format '{{.Names}}' | grep -qx '${PROD_POSTGRES_CONTAINER}'"

  log "Checking remote pg_dump access"
  run_remote_prod_dump >/dev/null

  log "Checking local Postgres access"
  prepare_local_database >/dev/null
  run_local_psql -tA -c 'SELECT 1' >/dev/null

  log "Doctor check passed."
}

pull() {
  require_command ssh
  ensure_local_pg_bin
  prepare_local_database

  mkdir -p "$SYNC_DIR"

  local timestamp dump_file backup_file
  timestamp="$(date +%Y%m%d-%H%M%S)"
  dump_file="${SYNC_DIR}/prod-${timestamp}.sql"
  backup_file="${SYNC_DIR}/local-before-prod-sync-${timestamp}.sql"

  backup_local_database "$backup_file"

  log "Pulling prod dump from ${PROD_SSH_HOST}:${PROD_POSTGRES_CONTAINER}"
  run_remote_prod_dump >"$dump_file"
  log "Prod dump size: $(wc -c <"$dump_file" | xargs) bytes"

  reset_local_database
  restore_prod_dump "$dump_file"
  apply_local_migrations
  ensure_local_bootstrap_user
  "$ROOT_DIR/scripts/local-postgres.sh" write-env >/dev/null
  print_table_counts

  if [ "$KEEP_DUMP" != "1" ]; then
    rm -f "$dump_file"
    log "Removed temporary dump file."
  else
    log "Kept prod dump at ${dump_file}"
  fi

  if [ "$BACKUP_LOCAL" = "1" ]; then
    log "Local backup saved at ${backup_file}"
  fi

  log "Local DB now contains the latest prod snapshot plus local migrations/bootstrap sync."
}

case "$COMMAND" in
  pull) pull ;;
  doctor) doctor ;;
  -h|--help|help) usage ;;
  *)
    usage
    exit 1
    ;;
esac
