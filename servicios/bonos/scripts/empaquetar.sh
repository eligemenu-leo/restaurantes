#!/bin/sh
# Junta cada función con sus módulos de _shared en un solo archivo, para pegarla en el editor
# de funciones del panel de Supabase (sin CLI). Uso: sh scripts/empaquetar.sh <carpeta-de-salida>
set -e
OUT=${1:-dist}; mkdir -p "$OUT"; OUT=$(cd "$OUT" && pwd)
cd "$(dirname "$0")/../supabase/functions"
strip() { sed -E '/^(import|export) .* from .\.\.?\/.*\.ts.;?$/d; s/^export (async function|function|const|type|interface)/\1/' "$1"; }
for f in bonos-pedido bonos-notificacion bonos-api; do
  { echo "// $f: archivo único para pegar en el editor de funciones de Supabase."
    echo "// Generado desde servicios/bonos/supabase/functions (repo restaurantes). No editar aquí."
    grep -h '^import .*npm:' _shared/db.ts $f/index.ts | sort -u
    for s in des redsys fechas db correo plantillas; do echo; echo "// ---- _shared/$s.ts"; strip _shared/$s.ts | grep -v '^import .*npm:'; done
    echo; echo "// ---- $f/index.ts"; strip $f/index.ts | grep -v '^import .*npm:'; } > "$OUT/$f.ts"
done
