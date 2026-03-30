#!/bin/bash
# Local PostgreSQL management
case "$1" in
  bootstrap)
    echo "Setting up local database..."
    createdb hq 2>/dev/null || echo "Database already exists"
    pnpm db:migrate
    pnpm db:seed
    echo "Bootstrap complete."
    ;;
  start) pg_ctl start ;;
  stop) pg_ctl stop ;;
  *) echo "Usage: $0 {bootstrap|start|stop}" ;;
esac
