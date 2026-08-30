#!/bin/bash
set -e

# my-daily-prayers Release Pipeline
# Usage: ./scripts/release.sh [patch|minor|major|version]
# Examples:
#   ./scripts/release.sh patch    # 0.0.1 -> 0.0.2
#   ./scripts/release.sh minor    # 0.0.1 -> 0.1.0
#   ./scripts/release.sh major    # 0.0.1 -> 1.0.0
#   ./scripts/release.sh 1.2.3    # explicit version

APP_DIR="my-daily-prayers"
CD="$(dirname "$0")"
ROOT="$(cd "$CD/.." && pwd)"
APP_PATH="$ROOT/$APP_DIR"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log_info() { echo -e "${GREEN}[INFO]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

cd "$APP_PATH"

# Get current version
CURRENT_VERSION=$(node -p "require('./package.json').version")
log_info "Current version: $CURRENT_VERSION"

# Determine new version
if [ -z "$1" ]; then
  log_error "Usage: $0 [patch|minor|major|version]"
  exit 1
fi

if [[ "$1" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  NEW_VERSION="$1"
else
  IFS='.' read -ra PARTS <<< "$CURRENT_VERSION"
  MAJOR=${PARTS[0]}
  MINOR=${PARTS[1]}
  PATCH=${PARTS[2]}

  case "$1" in
    patch) PATCH=$((PATCH + 1)) ;;
    minor) MINOR=$((MINOR + 1)); PATCH=0 ;;
    major) MAJOR=$((MAJOR + 1)); MINOR=0; PATCH=0 ;;
    *)
      log_error "Invalid increment: $1 (use patch, minor, major, or x.y.z)"
      exit 1
      ;;
  esac
  NEW_VERSION="$MAJOR.$MINOR.$PATCH"
fi

log_info "New version will be: $NEW_VERSION"

# Confirm
read -p "Release version $NEW_VERSION? [y/N] " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
  log_warn "Release cancelled"
  exit 0
fi

# ============================================
# STAGE 1: Pre-build checks
# ============================================
log_info "=== Stage 1: Pre-build checks ==="

# Lint
log_info "Running linter..."
npm run lint || {
  log_error "Lint failed. Fix issues before releasing."
  exit 1
}

# Tests (if they exist)
if grep -q '"test"' package.json; then
  log_info "Running tests..."
  npm run test || {
    log_error "Tests failed. Fix issues before releasing."
    exit 1
  }
fi

# Check git status
if [ -n "$(git status --porcelain)" ]; then
  log_warn "You have uncommitted changes. Commit them first."
  git status --short
  read -p "Continue anyway? [y/N] " -n 1 -r
  echo
  if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    exit 1
  fi
fi

# ============================================
# STAGE 2: Version bump
# ============================================
log_info "=== Stage 2: Version bump ==="

# Update package.json
npm version "$NEW_VERSION" --no-git-tag-version
log_info "Updated package.json to $NEW_VERSION"

# Commit version bump
git add package.json
git commit -m "chore: bump version to $NEW_VERSION"
log_info "Committed version bump"

# Tag
git tag -a "v$NEW_VERSION" -m "Release v$NEW_VERSION"
log_info "Created tag v$NEW_VERSION"

# ============================================
# STAGE 3: Build
# ============================================
log_info "=== Stage 3: Build ==="

npm run build || {
  log_error "Build failed"
  exit 1
}
log_info "Build complete"

# Capacitor sync
npm run cap:sync || {
  log_error "Capacitor sync failed"
  exit 1
}
log_info "Capacitor sync complete"

# ============================================
# STAGE 4: Create and upload bundle
# ============================================
log_info "=== Stage 4: Upload bundle ==="

cd dist && zip -r ../bundle.zip . && cd ..
BUNDLE_SIZE=$(wc -c < bundle.zip)
log_info "Bundle created: $(numfmt --to=iec-i --suffix=B $BUNDLE_SIZE 2>/dev/null || echo ${BUNDLE_SIZE} bytes)"

APP_ID="com.tdhcloud.mydailyprayers"
BASE="${CAPGO_SERVER_URL:-http://localhost:8090}"

# Check for credentials
if [ -z "$CAPGO_ADMIN_EMAIL" ] || [ -z "$CAPGO_ADMIN_PASSWORD" ]; then
  log_error "Set CAPGO_ADMIN_EMAIL and CAPGO_ADMIN_PASSWORD"
  exit 1
fi

# Authenticate
log_info "Authenticating to $BASE..."
TOKEN=$(curl -sf -X POST "${BASE}/api/collections/_superusers/auth-with-password" \
  -H "Content-Type: application/json" \
  -d "{\"identity\":\"${CAPGO_ADMIN_EMAIL}\",\"password\":\"${CAPGO_ADMIN_PASSWORD}\"}" | jq -r .token)

if [ "$TOKEN" = "null" ] || [ -z "$TOKEN" ]; then
  log_error "Authentication failed"
  exit 1
fi

# Upload
log_info "Uploading ${APP_ID}@${NEW_VERSION}..."
RESULT=$(curl -s -X POST "${BASE}/v1/admin/upload" \
  -H "Authorization: ${TOKEN}" \
  -F "file=@bundle.zip" \
  -F "version=$NEW_VERSION" \
  -F "app_id=$APP_ID")

rm -f bundle.zip

# Verify upload
if echo "$RESULT" | jq -e '.status == "ok"' >/dev/null; then
  CHECKSUM=$(echo "$RESULT" | jq -r '.checksum')
  log_info "✓ Bundle uploaded successfully!"
  log_info "  Checksum: $CHECKSUM"
else
  log_error "Upload failed: $RESULT"
  exit 1
fi

# ============================================
# STAGE 5: Verification
# ============================================
log_info "=== Stage 5: Verification ==="

# Test update endpoint
log_info "Testing update endpoint..."
UPDATE_RESP=$(curl -sf -X POST "${BASE}/v1/updates" \
  -H "Content-Type: application/json" \
  -d '{"platform":"android","device_id":"release-test","app_id":"'$APP_ID'","version_name":"0.0.0","is_emulator":false,"is_prod":true}')

UPDATE_VERSION=$(echo "$UPDATE_RESP" | jq -r '.version')
if [ "$UPDATE_VERSION" = "$NEW_VERSION" ]; then
  log_info "✓ Update endpoint returns version $NEW_VERSION"
else
  log_warn "Update endpoint returned unexpected version: $UPDATE_VERSION"
fi

# List recent bundles
log_info "Recent bundles:"
curl -sf "${BASE}/v1/admin/bundles?app_id=$APP_ID&limit=3" \
  -H "Authorization: ${TOKEN}" | jq -r '.[] | "  \(.version) @ \(.created_at)"'

# ============================================
# Done
# ============================================
log_info "=== Release $NEW_VERSION complete! ==="

log_info "Next steps:"
echo "  1. Push: git push && git push --tags"
echo "  2. Build APK: cd android && ./gradlew assembleDebug"
echo "  3. Test on device before deploying"
