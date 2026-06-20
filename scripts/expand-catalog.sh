#!/usr/bin/env bash
#
# expand-catalog.sh — run the full catalog-expansion pipeline in one
# shot. Walks discover → scrape → parse → vectorize → upload →
# compute-dupes → mirror-images → AI performance descriptions, with
# per-step timestamps so you can see what's taking how long.
#
# Usage:
#   ./scripts/expand-catalog.sh [target_count]
#
# Examples:
#   ./scripts/expand-catalog.sh             # uses default target (5000)
#   ./scripts/expand-catalog.sh 3000        # cap at 3k fragrances
#   ./scripts/expand-catalog.sh 10000       # full v1 target
#
# Resume behavior:
#   Every individual step is resume-safe in isolation. If the pipeline
#   dies partway, just re-run this script with the same target — discover
#   re-uses queue.json, scrape skips already-fetched URLs, upload upserts
#   on (name, house), the AI script filters on IS NULL columns.
#
# Skip specific steps:
#   SKIP_SCRAPE=1 ./scripts/expand-catalog.sh         # if scrape already done
#   SKIP_IMAGES=1 ./scripts/expand-catalog.sh         # skip image mirroring
#   SKIP_AI=1     ./scripts/expand-catalog.sh         # skip OpenAI calls
#   ONLY_AI=1     ./scripts/expand-catalog.sh         # AI only, nothing else

set -eu  # exit on error; treat unset vars as errors

# ----- Setup -----

# Resolve project root from the script's own location, so this works
# whether the user runs it from root, from inside scripts/, or anywhere
# else.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
SCRAPER_DIR="$PROJECT_ROOT/scraper"

if [ ! -d "$SCRAPER_DIR" ]; then
  echo "ERROR: scraper/ not found at $SCRAPER_DIR" >&2
  exit 1
fi

# Target count comes from CLI arg (default 5000) and is exported so the
# scrape script picks it up via SCRAPE_LIMIT.
export SCRAPE_LIMIT="${1:-5000}"

# Skip flags default off — override via env to skip specific steps.
SKIP_DISCOVER="${SKIP_DISCOVER:-0}"
SKIP_SCRAPE="${SKIP_SCRAPE:-0}"
SKIP_PARSE="${SKIP_PARSE:-0}"
SKIP_VECTORIZE="${SKIP_VECTORIZE:-0}"
SKIP_UPLOAD="${SKIP_UPLOAD:-0}"
SKIP_DUPES="${SKIP_DUPES:-0}"
SKIP_IMAGES="${SKIP_IMAGES:-0}"
SKIP_AI="${SKIP_AI:-0}"
ONLY_AI="${ONLY_AI:-0}"

if [ "$ONLY_AI" = "1" ]; then
  SKIP_DISCOVER=1; SKIP_SCRAPE=1; SKIP_PARSE=1
  SKIP_VECTORIZE=1; SKIP_UPLOAD=1; SKIP_DUPES=1; SKIP_IMAGES=1
fi

# Pick the package runner — prefer pnpm, fall back to npm. Both work
# because all the relevant scripts are defined in scraper/package.json.
if command -v pnpm >/dev/null 2>&1; then
  RUNNER="pnpm"
elif command -v npm >/dev/null 2>&1; then
  RUNNER="npm run"
else
  echo "ERROR: neither pnpm nor npm found in PATH" >&2
  exit 1
fi

# ----- Logging helpers -----

# Tracks pipeline-wide start time so the final summary can report total
# elapsed.
PIPELINE_START="$(date +%s)"

# Records each step's name + duration so the summary can recap.
declare -a STEP_NAMES=()
declare -a STEP_SECONDS=()

# log_step "Step name" runs the supplied command via "$@" with start and
# end banners. Captures wall-clock duration. Exits the whole pipeline on
# failure (set -e takes care of that, but we add explicit messaging so
# the user knows which step died).
log_step() {
  local label="$1"
  shift
  local started; started="$(date +%s)"
  echo ""
  echo "============================================================"
  echo "▶  $label"
  echo "   $(date)"
  echo "============================================================"
  if ! "$@"; then
    local code=$?
    echo ""
    echo "✗ $label FAILED (exit $code)"
    exit $code
  fi
  local ended; ended="$(date +%s)"
  local elapsed=$((ended - started))
  STEP_NAMES+=("$label")
  STEP_SECONDS+=("$elapsed")
  printf "✓ %s (%dm %ds)\n" "$label" $((elapsed / 60)) $((elapsed % 60))
}

skip_step() {
  echo "↷  skipping: $1"
}

# ----- Pre-flight -----

echo ""
echo "============================================================"
echo "Spritz catalog expansion pipeline"
echo "============================================================"
echo "Target count : $SCRAPE_LIMIT fragrances"
echo "Scraper dir  : $SCRAPER_DIR"
echo "Runner       : $RUNNER"
echo "Started      : $(date)"
echo "============================================================"

cd "$SCRAPER_DIR"

# Sanity-check that dependencies are installed before running anything
# slow. Avoids "discover blew up because playwright wasn't installed"
# after you've already committed to a long-running job.
if [ ! -d node_modules ]; then
  echo ""
  echo "node_modules missing — installing scraper deps..."
  $RUNNER install
fi

# ----- The pipeline -----

[ "$SKIP_DISCOVER" = "1" ] && skip_step "1/8 discover" || log_step "1/8 discover (find URLs up to SCRAPE_LIMIT)" $RUNNER discover

[ "$SKIP_SCRAPE" = "1" ] && skip_step "2/8 scrape" || log_step "2/8 scrape (download HTML, rate-limited 5-15s/req)" $RUNNER scrape

[ "$SKIP_PARSE" = "1" ] && skip_step "3/8 parse" || log_step "3/8 parse (Cheerio extract to JSON)" $RUNNER parse

[ "$SKIP_VECTORIZE" = "1" ] && skip_step "4/8 vectorize" || log_step "4/8 vectorize (note pyramid embeddings)" $RUNNER vectorize

[ "$SKIP_UPLOAD" = "1" ] && skip_step "5/8 upload" || log_step "5/8 upload (upsert to Supabase)" $RUNNER upload

[ "$SKIP_DUPES" = "1" ] && skip_step "6/8 compute-dupes" || log_step "6/8 compute-dupes (similarity pairs across catalog)" $RUNNER compute-dupes

[ "$SKIP_IMAGES" = "1" ] && skip_step "7/8 mirror:images" || log_step "7/8 mirror:images (bottle photos → Supabase Storage)" $RUNNER mirror:images

[ "$SKIP_AI" = "1" ] && skip_step "8/8 AI performance descriptions" || log_step "8/8 AI performance descriptions (gpt-4o-mini)" $RUNNER tsx src/generate-performance-descriptions.ts

# ----- Summary -----

PIPELINE_END="$(date +%s)"
TOTAL_ELAPSED=$((PIPELINE_END - PIPELINE_START))

echo ""
echo "============================================================"
echo "Pipeline complete"
echo "============================================================"
printf "%-55s %s\n" "Step" "Duration"
echo "------------------------------------------------------------"
for i in "${!STEP_NAMES[@]}"; do
  printf "%-55s %dm %ds\n" "${STEP_NAMES[$i]}" $((STEP_SECONDS[i] / 60)) $((STEP_SECONDS[i] % 60))
done
echo "------------------------------------------------------------"
printf "%-55s %dh %dm\n" "Total" $((TOTAL_ELAPSED / 3600)) $(((TOTAL_ELAPSED % 3600) / 60))
echo "============================================================"
echo ""
echo "Next: redeploy Vercel (or just push any commit) so the new"
echo "catalog rows are reflected. The app reads from Supabase live,"
echo "so no code change is strictly required."
