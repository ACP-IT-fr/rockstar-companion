#!/usr/bin/env bash
set -euo pipefail

# Deploy script for Rockstar Audio Dashboard
# Target: massive-hoster:/domains/music-dashboard.flat-spaces.com/public_html

REPO_ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
DASHBOARD_DIR="$REPO_ROOT/code/extension/dashboard"
STAGING_DIR="/tmp/rockstar-dashboard-deploy-$$"

REMOTE="massive-hoster:/domains/music-dashboard.flat-spaces.com/public_html"

echo "=== Rockstar Audio Dashboard Deploy ==="
echo "Source: $DASHBOARD_DIR"
echo "Remote: $REMOTE"
echo ""

# 1. Create staging directory
rm -rf "$STAGING_DIR"
mkdir -p "$STAGING_DIR/widgets"

# 2. Copy dashboard files
cp "$DASHBOARD_DIR/index.html" "$STAGING_DIR/index.html"
cp "$DASHBOARD_DIR/dashboard.js" "$STAGING_DIR/dashboard.js"

# 3. Copy widget files (flattened structure for web root)
cp "$REPO_ROOT/code/extension/widgets/metronome.js" "$STAGING_DIR/widgets/metronome.js"
cp "$REPO_ROOT/code/extension/widgets/tuner.js" "$STAGING_DIR/widgets/tuner.js"
cp "$REPO_ROOT/code/extension/widgets/chordDetector.js" "$STAGING_DIR/widgets/chordDetector.js"
cp "$REPO_ROOT/code/extension/widgets/singingTracker.js" "$STAGING_DIR/widgets/singingTracker.js"
cp "$REPO_ROOT/code/extension/widgets/pianoKeyboard.js" "$STAGING_DIR/widgets/pianoKeyboard.js"

# 4. Copy content.css (piano styles)
cp "$REPO_ROOT/code/extension/content.css" "$STAGING_DIR/content.css"

# 5. Fix paths in index.html for deployed structure
#    - ../widgets/... → widgets/...
#    - ../content.css → content.css
sed -i '' 's|src="../widgets/|src="widgets/|g' "$STAGING_DIR/index.html"
sed -i '' 's|href="../content.css"|href="content.css"|g' "$STAGING_DIR/index.html"

# 6. Show what will be deployed
echo "Files to deploy:"
find "$STAGING_DIR" -type f | sort
echo ""

# 7. Rsync to remote
echo "Uploading to $REMOTE ..."
rsync -avz --delete \
  --exclude='.DS_Store' \
  --exclude='*.map' \
  "$STAGING_DIR/" "$REMOTE/"

# 8. Cleanup
rm -rf "$STAGING_DIR"

echo ""
echo "=== Deploy complete ==="
echo "URL: https://music-dashboard.flat-spaces.com/index.html"
