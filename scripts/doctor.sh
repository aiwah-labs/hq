#!/usr/bin/env bash
# pnpm doctor — checks local dev prerequisites
set -euo pipefail

PASS="\033[32m✓\033[0m"
FAIL="\033[31m✗\033[0m"
WARN="\033[33m!\033[0m"
errors=0

check() {
  local label="$1"
  local ok="$2"
  local msg="${3:-}"
  if [ "$ok" = "1" ]; then
    echo -e "  $PASS $label"
  else
    echo -e "  $FAIL $label${msg:+: $msg}"
    errors=$((errors + 1))
  fi
}

warn() {
  echo -e "  $WARN $1"
}

echo ""
echo "HQ Doctor"
echo "───────────────────────────────────────"

# Node.js
echo ""
echo "Runtime"
node_ver=$(node --version 2>/dev/null | sed 's/v//' | cut -d. -f1)
check "Node.js 22+" "$([ "${node_ver:-0}" -ge 22 ] && echo 1 || echo 0)" "found $(node --version 2>/dev/null || echo 'not found')"

pnpm_ok=$(pnpm --version &>/dev/null && echo 1 || echo 0)
check "pnpm" "$pnpm_ok" "$(pnpm --version 2>/dev/null || echo 'not found')"

# Docker
docker_ok=$(docker info &>/dev/null && echo 1 || echo 0)
check "Docker running" "$docker_ok"

# Env files
echo ""
echo "Environment"
env_db=$([ -f shared/db/.env ] && echo 1 || echo 0)
check "shared/db/.env" "$env_db" "run pnpm db:local:bootstrap to create"

env_api=$([ -f apps/api/.env.local ] && echo 1 || echo 0)
check "apps/api/.env.local" "$env_api" "run pnpm db:local:bootstrap to create"

env_workshop=$([ -f apps/workshop/.env.local ] && echo 1 || echo 0)
check "apps/workshop/.env.local" "$env_workshop" "run pnpm db:local:bootstrap to create"

# DATABASE_URL
db_url=""
if [ -f shared/db/.env ]; then
  db_url=$(grep '^DATABASE_URL=' shared/db/.env | cut -d= -f2- | tr -d '"')
fi
check "DATABASE_URL set" "$([ -n "$db_url" ] && echo 1 || echo 0)" "not found in shared/db/.env"

# Postgres reachability
if [ -n "$db_url" ]; then
  pg_ok=$(DATABASE_URL="$db_url" node -e "
    import('@hq/db').then(({db}) => db.\$queryRaw\`SELECT 1\`.then(() => process.exit(0))).catch(() => process.exit(1))
  " 2>/dev/null && echo 1 || echo 0)
  check "Postgres reachable" "$pg_ok" "is the local Postgres container running? (pnpm db:local:start)"
fi

# Prisma client
prisma_ok=$([ -d node_modules/.pnpm ] && ls node_modules/.pnpm | grep -q "prisma" && echo 1 || echo 0)
check "Dependencies installed" "$([ -d node_modules ] && echo 1 || echo 0)" "run pnpm install"

# Required secrets in env files
echo ""
echo "Secrets"
session_secret=""
if [ -f apps/api/.env.local ]; then
  session_secret=$(grep '^SESSION_SECRET=' apps/api/.env.local | cut -d= -f2-)
fi
if [ -z "$session_secret" ]; then
  warn "SESSION_SECRET not set in apps/api/.env.local — ok for local dev, required for production"
fi

echo ""
echo "───────────────────────────────────────"
if [ "$errors" -eq 0 ]; then
  echo -e "\033[32mAll checks passed.\033[0m"
else
  echo -e "\033[31m$errors check(s) failed. See above for details.\033[0m"
  exit 1
fi
echo ""
