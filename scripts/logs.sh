#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# logs.sh [app] [command] [filter]
#
# Quick log browsing tool for aiwah-hq dev sessions.
# All log files are JSON lines — agent logs are tagged with "event" field.
#
# Usage:
#   ./scripts/logs.sh                      # tail latest API log
#   ./scripts/logs.sh api                  # tail latest API log
#   ./scripts/logs.sh workshop             # tail latest workshop log
#   ./scripts/logs.sh api tail             # tail -f latest API log
#   ./scripts/logs.sh api cat              # dump entire latest session
#   ./scripts/logs.sh api errors           # show all error-level entries (jq pretty)
#   ./scripts/logs.sh api agent            # show all [agent] structured log lines
#   ./scripts/logs.sh api event stream.error   # filter by specific event name
#   ./scripts/logs.sh api session <name>   # open a specific session file
#   ./scripts/logs.sh api list             # list all sessions for this app
#   ./scripts/logs.sh api clean            # delete all log files for this app
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

APP="${1:-api}"
CMD="${2:-tail}"
ARG="${3:-}"

LOGS_DIR="${ROOT_DIR}/logs/${APP}"
LATEST="${LOGS_DIR}/latest.log"

# ── Helpers ──────────────────────────────────────────────────────────────────

require_latest() {
  if [[ ! -f "$LATEST" ]]; then
    echo "No logs found for '${APP}'. Start the app first with pnpm dev:platform." >&2
    echo "Expected: ${LATEST}" >&2
    exit 1
  fi
}

pretty_json_lines() {
  # Try jq; fall back to cat if not installed
  if command -v jq &>/dev/null; then
    jq -C '.'
  else
    cat
  fi
}

# ── Commands ─────────────────────────────────────────────────────────────────

case "$CMD" in

  tail)
    require_latest
    echo "── ${APP} / latest ──────────────────────────────────────────" >&2
    tail -f "$LATEST"
    ;;

  cat)
    require_latest
    cat "$LATEST"
    ;;

  errors)
    # All log lines with level=error or level=warn
    require_latest
    echo "── ${APP} errors + warnings ──────────────────────────────────" >&2
    grep -E '"level":"(error|warn)"' "$LATEST" | pretty_json_lines
    ;;

  agent)
    # Lines emitted by the agent runner log() helper (prefixed with [agent])
    require_latest
    echo "── ${APP} agent events ───────────────────────────────────────" >&2
    grep '^\[agent\] ' "$LATEST" \
      | sed 's/^\[agent\] //' \
      | pretty_json_lines
    ;;

  event)
    # Filter by a specific event name: ./scripts/logs.sh api event stream.error
    require_latest
    if [[ -z "$ARG" ]]; then
      echo "Usage: logs.sh ${APP} event <event-name>" >&2
      exit 1
    fi
    echo "── ${APP} event=${ARG} ───────────────────────────────────────" >&2
    grep '^\[agent\] ' "$LATEST" \
      | sed 's/^\[agent\] //' \
      | jq -C "select(.event == \"${ARG}\")"
    ;;

  session)
    # Open a specific named session: ./scripts/logs.sh api session 2025-01-15T14-30-00
    if [[ -z "$ARG" ]]; then
      echo "Usage: logs.sh ${APP} session <session-name>" >&2
      exit 1
    fi
    SESSION_FILE="${LOGS_DIR}/${ARG}.log"
    if [[ ! -f "$SESSION_FILE" ]]; then
      echo "Session not found: ${SESSION_FILE}" >&2
      exit 1
    fi
    cat "$SESSION_FILE"
    ;;

  list)
    if [[ ! -d "$LOGS_DIR" ]]; then
      echo "No log directory for '${APP}' yet." >&2
      exit 0
    fi
    echo "── ${APP} sessions ───────────────────────────────────────────" >&2
    ls -lht "${LOGS_DIR}"/*.log 2>/dev/null \
      | awk '{print $6, $7, $8, $9}' \
      | grep -v 'latest.log' \
      || echo "(none)"
    echo ""
    LATEST_TARGET="$(readlink "${LOGS_DIR}/latest.log" 2>/dev/null || echo 'none')"
    echo "latest.log → ${LATEST_TARGET}"
    ;;

  clean)
    if [[ ! -d "$LOGS_DIR" ]]; then
      echo "Nothing to clean for '${APP}'." >&2
      exit 0
    fi
    COUNT="$(find "$LOGS_DIR" -name '*.log' ! -name 'latest.log' | wc -l | tr -d ' ')"
    echo "Delete ${COUNT} log file(s) in ${LOGS_DIR}? [y/N]" >&2
    read -r CONFIRM
    if [[ "$CONFIRM" =~ ^[Yy]$ ]]; then
      find "$LOGS_DIR" -name '*.log' ! -name 'latest.log' -delete
      rm -f "${LOGS_DIR}/latest.log"
      echo "Cleaned." >&2
    fi
    ;;

  *)
    echo "Unknown command: ${CMD}" >&2
    echo "Usage: logs.sh [app] [tail|cat|errors|agent|event|session|list|clean]" >&2
    exit 1
    ;;

esac
