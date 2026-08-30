#!/bin/bash
# Quick release - skips tests and confirmations
# Usage: CAPGO_ADMIN_EMAIL=x CAPGO_ADMIN_PASSWORD=y ./scripts/quick-release.sh

set -e

APP_DIR="my-daily-prayers"
CD="$(dirname "$0")"
ROOT="$(cd "$CD/.." && pwd)"
APP_PATH="$ROOT/$APP_DIR"

cd "$APP_PATH"

# Auto-increment patch version
CURRENT_VERSION=$(node -p "require('./package.json').version")
IFS='.' read -ra PARTS <<< "$CURRENT_VERSION"
NEW_VERSION="${PARTS[0]}.${PARTS[1]}.$((${PARTS[2]} + 1))"

echo "Quick releasing: $CURRENT_VERSION -> $NEW_VERSION"

# Bump version
npm version "$NEW_VERSION" --no-git-tag-version --no-commit-hooks

# Build
npm run build

# Create bundle
cd dist && zip -r ../bundle.zip . && cd ..

# Upload
APP_ID="com.tdhcloud.mydailyprayers"
BASE="${CAPGO_SERVER_URL:-http://localhost:8090}"

TOKEN=$(curl -sf -X POST "${BASE}/api/collections/_superusers/auth-with-password" \
  -H "Content-Type: application/json" \
  -d "{\"identity\":\"${CAPGO_ADMIN_EMAIL}\",\"password\":\"${CAPGO_ADMIN_PASSWORD}\"}" | jq -r .token)

echo "Uploading $APP_ID@$NEW_VERSION..."
curl -s -X POST "${BASE}/v1/admin/upload" \
  -H "Authorization: ${TOKEN}" \
  -F "file=@bundle.zip" \
  -F "version=$NEW_VERSION" \
  -F "app_id=$APP_ID" | jq .

rm -f bundle.zip
echo "✓ Released $NEW_VERSION"
