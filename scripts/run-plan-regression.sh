#!/usr/bin/env bash
set -euo pipefail
cd /workspace
BR=$(git rev-parse --abbrev-ref HEAD)
BENCH_REF="${BENCH_SCRIPTS_REF:-$(git rev-parse HEAD)}"
MODEL=/opt/cursor/artifacts/east-model.json
: > /opt/cursor/artifacts/bench-plan-1km.jsonl

inject_bench_scripts() {
  git show "${BENCH_REF}:scripts/bench-plan-1km.mjs" > scripts/bench-plan-1km.mjs
  git show "${BENCH_REF}:scripts/render-site-plan-crop.mjs" > scripts/render-site-plan-crop.mjs
}

if [[ ! -f "$MODEL" ]]; then
  echo "Need $MODEL — run qa-footpath-fillet-east-melbourne.mjs or save model first" >&2
  exit 1
fi

refs=(caac962 origin/main HEAD)
labels=(caac962 main pr)

for i in "${!refs[@]}"; do
  ref=${refs[$i]}
  label=${labels[$i]}
  git checkout "$ref" --quiet
  inject_bench_scripts
  npm run build --silent 2>/dev/null || npm run build
  npx vite-node scripts/bench-plan-1km.mjs "$MODEL" "$label"
  fillet=2
  [[ "$label" == "caac962" ]] && fillet=0
  npx vite-node scripts/render-site-plan-crop.mjs "$MODEL" "$label" "430 -120 70 70" "$fillet"
done

git checkout "$BR" --quiet
npm run build --silent 2>/dev/null || npm run build
echo "Plan regression complete. See /opt/cursor/artifacts/bench-plan-1km.jsonl and footpath-fillet-plan-*.png"
