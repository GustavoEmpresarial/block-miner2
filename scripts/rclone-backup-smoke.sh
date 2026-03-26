#!/bin/sh
# Teste rápido rclone → Google Drive a partir do container app.
# Uso na VPS: docker compose exec app sh /app/scripts/rclone-backup-smoke.sh gdrive ID_DA_PASTA
set -e
REMOTE="${1:-gdrive}"
FOLDER="${2:-}"
if [ -z "$FOLDER" ]; then
  echo "Uso: $0 <remote> <folder_id>"
  echo "Ex.: $0 gdrive 1a2b3c4d5e6f7g8h9i0j"
  exit 1
fi
echo "==> rclone list remotes"
rclone listremotes
echo "==> rclone lsd ${REMOTE}:"
rclone lsd "${REMOTE}:"
TMP="/tmp/blockminer-rclone-smoke-$$.txt"
echo "blockminer smoke $(date -Iseconds)" >"$TMP"
echo "==> rclone copy -> ${REMOTE}:${FOLDER}"
rclone copy "$TMP" "${REMOTE}:${FOLDER}" -v
rm -f "$TMP"
echo "==> OK — verifica a pasta no Google Drive."
