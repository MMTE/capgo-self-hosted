#!/bin/bash
set -e

APP_DIR="${CAPGO_APP_DIR:-my-daily-prayers}"
cd "$(dirname "$0")/../${APP_DIR}"

echo "Building ${APP_DIR}..."
npm run build

echo "Creating bundle zip..."
cd dist && zip -r ../bundle.zip . && cd ..

VERSION=$(node -p "require('./package.json').version")
APP_ID="${CAPGO_APP_ID:?set CAPGO_APP_ID to your app id}"
BASE="${CAPGO_SERVER_URL:-http://localhost:8090}"

echo "Authenticating..."
TOKEN=$(curl -sf -X POST "${BASE}/api/collections/_superusers/auth-with-password" \
  -H "Content-Type: application/json" \
  -d "{\"identity\":\"${CAPGO_ADMIN_EMAIL:?}\",\"password\":\"${CAPGO_ADMIN_PASSWORD:?}\"}" | jq -r .token)

echo "Uploading bundle v${VERSION} (${APP_ID})..."
curl -X POST "${BASE}/v1/admin/upload" \
  -H "Authorization: ${TOKEN}" \
  -F "file=@bundle.zip" \
  -F "version=$VERSION" \
  -F "app_id=$APP_ID"

rm -f bundle.zip
echo ""
echo "Bundle v${VERSION} uploaded!"
