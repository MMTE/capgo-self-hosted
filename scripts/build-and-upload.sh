#!/bin/bash
set -e

cd /root/projects/capgo/sample-app

echo "Building sample app..."
npm run build

echo "Creating bundle zip..."
cd dist && zip -r ../bundle.zip . && cd ..

VERSION=$(node -p "require('./package.json').version")
echo "Uploading bundle v${VERSION}..."

curl -X POST http://localhost:3001/v1/admin/upload \
  -F "file=@bundle.zip" \
  -F "version=$VERSION"

rm -f bundle.zip
echo ""
echo "Bundle v${VERSION} uploaded!"
