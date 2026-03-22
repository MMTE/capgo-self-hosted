#!/bin/bash
set -e

cd "$(dirname "$0")/../my-daily-prayers"

echo "Building my-daily-prayers..."
npm run build

echo "Creating bundle zip..."
cd dist && zip -r ../bundle.zip . && cd ..

VERSION=$(node -p "require('./package.json').version")
APP_ID="com.tdhcloud.mydailyprayers"
echo "Uploading bundle ${APP_ID}@${VERSION}..."

curl -X POST "${CAPGO_SERVER_URL:-http://localhost:3001}/v1/admin/upload" \
  -F "file=@bundle.zip" \
  -F "version=$VERSION" \
  -F "app_id=$APP_ID"

rm -f bundle.zip
echo ""
echo "Bundle v${VERSION} uploaded!"
