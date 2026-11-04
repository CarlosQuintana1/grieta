#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
GRUPO="rg-grieta"
VERSION="$(sed -n 's/^const VERSION = "\([^"]*\)";.*/\1/p' "$ROOT/demo/sw.js")"

if [[ "$(git -C "$ROOT" branch --show-current)" != "main" ]]; then
  echo "Publica solo desde main." >&2
  exit 1
fi

if [[ -n "$(git -C "$ROOT" status --porcelain)" ]]; then
  echo "El repo tiene cambios sin commit. Deja main limpio antes de publicar." >&2
  exit 1
fi

if [[ -z "$VERSION" ]]; then
  echo "No pude leer la versión de demo/sw.js." >&2
  exit 1
fi

printf 'Vas a publicar %s en producción. Escribe PUBLICAR %s para continuar: ' "$VERSION" "$VERSION"
read -r CONFIRMACION
if [[ "$CONFIRMACION" != "PUBLICAR $VERSION" ]]; then
  echo "Publicación cancelada."
  exit 1
fi

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

az account show >/dev/null

echo "1/4 API en Azure App Service..."
mkdir -p "$TMP/api"
rsync -a --exclude node_modules --exclude test --exclude uploads --exclude '.env*' \
  --exclude tablas-azure.mjs --exclude prueba-foto.png --exclude importar-capturas.mjs \
  --exclude postman --exclude '*.sqlite' "$ROOT/api/" "$TMP/api/"
(cd "$TMP/api" && npm ci --omit=dev --no-audit --no-fund >/dev/null && zip -qr "$TMP/api.zip" .)
az webapp deploy -g "$GRUPO" -n grieta-api-qro --src-path "$TMP/api.zip" --type zip -o none

echo "2/4 Demo en Azure App Service..."
(cd "$ROOT/demo" && zip -qr "$TMP/demo.zip" . -x README.md)
az webapp deploy -g "$GRUPO" -n grieta-web-qro --src-path "$TMP/demo.zip" --type zip -o none

echo "3/4 Demo en Azure Storage..."
az storage blob upload-batch --account-name grietawebqro --auth-mode login \
  -d '$web' -s "$ROOT/demo" --overwrite

echo "4/4 Demo en Cloudflare Pages..."
(cd "$ROOT/demo" && npx wrangler pages deploy . --project-name grieta-demo --branch main)

echo "Comprobando versiones y API..."
for URL in \
  https://grieta-web-qro.azurewebsites.net \
  https://grietawebqro.z14.web.core.windows.net \
  https://grieta-demo.pages.dev; do
  PUBLICADA="$(curl -fsSL "$URL/sw.js?x=$(date +%s)" | grep -o 'grieta-[0-9]*' | head -1 || true)"
  printf '%s: %s\n' "$URL" "${PUBLICADA:-sin versión}"
  if [[ "$PUBLICADA" != "$VERSION" ]]; then
    echo "La versión publicada no coincide con $VERSION." >&2
    exit 1
  fi
done

curl -fsS -o /dev/null -w 'API salud: %{http_code}\n' https://grieta-api-qro.azurewebsites.net/api/salud
echo "Publicación de $VERSION terminada."
