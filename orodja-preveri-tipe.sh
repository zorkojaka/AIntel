#!/usr/bin/env bash
# Preveri tipe frontend modula. NUJNO: `npm run build` (vite/esbuild) tipov NE
# preverja in ne javi niti nedefiniranih imen — napaka se pokaze sele kot bela
# stran v brskalniku. Ta skripta obide dve oviri projektnih tsconfigov:
#   - rootDir (uvozi iz packages/ui so "izven rootDir"),
#   - types: ["vite/client"] (v modulu ni na voljo).
#
#   bash orodja-preveri-tipe.sh module-settings [vzorec-datoteke]
set -Eeuo pipefail
MODUL="${1:?uporaba: orodja-preveri-tipe.sh <modul> [vzorec]}"
VZOREC="${2:-}"
KOREN="$(cd "$(dirname "$0")" && pwd)"
MODUL_DIR="$KOREN/apps/$MODUL"
[ -d "$MODUL_DIR" ] || { echo "Ni modula: $MODUL_DIR"; exit 1; }

CFG="$(mktemp /tmp/tsconfig-preveri-XXXX.json)"
trap 'rm -f "$CFG"' EXIT
cat > "$CFG" <<JSON
{
  "extends": "$MODUL_DIR/tsconfig.json",
  "compilerOptions": { "rootDir": "$KOREN", "noEmit": true, "types": [], "ignoreDeprecations": "5.0" },
  "include": ["$MODUL_DIR/src"]
}
JSON

IZHOD="$("$MODUL_DIR/node_modules/.bin/tsc" --noEmit -p "$CFG" 2>&1 || true)"
if [ -n "$VZOREC" ]; then
  IZHOD="$(printf '%s\n' "$IZHOD" | grep -E "$VZOREC" || true)"
fi
if [ -z "$IZHOD" ]; then
  echo "OK: brez tipskih napak${VZOREC:+ (vzorec: $VZOREC)}"
else
  printf '%s\n' "$IZHOD"
  echo "--- napak: $(printf '%s\n' "$IZHOD" | grep -c 'error TS' || true)"
  echo "OPOMBA: modul ima tudi predobstojece napake (npr. Button variant=\"outline\"); filtriraj z vzorcem."
fi
