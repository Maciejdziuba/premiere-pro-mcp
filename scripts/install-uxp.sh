#!/bin/bash
# Print safe UXP Developer Tool loading steps for a Premiere Pro UXP panel.
# UXP panels are loaded through Adobe UXP Developer Tool, not installed by
# symlinking into an Adobe extensions folder like CEP.

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
DEFAULT_MANIFEST="$PROJECT_DIR/uxp-panel/manifest.json"
MANIFEST_PATH="${UXP_MANIFEST_PATH:-$DEFAULT_MANIFEST}"
OPEN_UDT=false
CHECK_ONLY=false

print_help() {
  cat <<EOF
Load the Premiere Pro UXP panel through Adobe UXP Developer Tool.

Usage:
  npm run install-uxp
  npm run install-uxp -- --manifest /absolute/path/to/manifest.json
  npm run install-uxp -- --open-udt
  npm run install-uxp -- --check-only

Options:
  --manifest <path>   UXP manifest.json path. Defaults to ./uxp-panel/manifest.json.
  --open-udt          Open Adobe UXP Developer Tool on macOS after printing steps.
  --check-only        Only validate whether the manifest path exists.
  -h, --help          Show this help.

Adobe UXP Developer Tool must do the actual load:
  1. Enable Developer Mode in UXP Developer Tool.
  2. Click Add Plugin and choose the manifest.json path below.
  3. Click Load or Load & Watch.
  4. Open the UXP panel in Premiere Pro and run its read-only transcript status check.
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --manifest)
      MANIFEST_PATH="$2"
      shift 2
      ;;
    --manifest=*)
      MANIFEST_PATH="${1#--manifest=}"
      shift
      ;;
    --open-udt)
      OPEN_UDT=true
      shift
      ;;
    --check-only)
      CHECK_ONLY=true
      shift
      ;;
    -h|--help)
      print_help
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      echo "Run scripts/install-uxp.sh --help for usage." >&2
      exit 1
      ;;
  esac
done

if [[ "$MANIFEST_PATH" != /* ]]; then
  MANIFEST_PATH="$PWD/$MANIFEST_PATH"
fi

echo "=== Premiere UXP Panel Loader Helper ==="
echo ""
echo "Manifest: $MANIFEST_PATH"

if [[ -f "$MANIFEST_PATH" ]]; then
  echo "Status:   manifest found"
else
  echo "Status:   manifest not found"
  echo ""
  echo "No bundled UXP panel was found at uxp-panel/manifest.json. Use Adobe UXP Developer Tool"
  echo "to create/open a Premiere Pro UXP sample or pass --manifest to an existing"
  echo "Premiere UXP panel manifest."
fi

if [[ "$CHECK_ONLY" == true ]]; then
  if [[ -f "$MANIFEST_PATH" ]]; then
    exit 0
  fi
  exit 1
fi

echo ""
echo "Safe UDT loading steps:"
echo "  1. Open Adobe UXP Developer Tool."
echo "  2. Enable Developer Mode if UDT asks for it."
echo "  3. Click Add Plugin and select:"
echo "     $MANIFEST_PATH"
echo "  4. Click Load or Load & Watch."
echo "  5. In Premiere Pro, open the UXP panel and run its read-only transcript status check."
echo ""
echo "Keep the CEP MCP Bridge panel loaded separately with:"
echo "  npm run install-cep"
echo ""
echo "This script does not modify Premiere projects, Adobe global settings, or MCP config."

if [[ "$OPEN_UDT" == true ]]; then
  if [[ "$OSTYPE" == "darwin"* ]]; then
    open -a "Adobe UXP Developer Tool" || {
      echo "Could not open Adobe UXP Developer Tool. Open it manually and use the steps above." >&2
      exit 1
    }
  else
    echo "--open-udt is only implemented for macOS. Open Adobe UXP Developer Tool manually." >&2
    exit 1
  fi
fi
