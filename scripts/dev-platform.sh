#!/bin/bash
set -e
echo "Starting HQ platform..."
pnpm --filter @hq/api dev &
pnpm --filter @hq/workshop dev &
wait
