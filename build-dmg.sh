#!/bin/bash
# Surge — build a signed (ad-hoc) .dmg on macOS. Run from the surge-app folder:  ./build-dmg.sh
set -e
command -v node >/dev/null || { echo "Install Node first: https://nodejs.org (or: brew install node)"; exit 1; }
npm install --no-audit --no-fund
rm -rf dist
# 1. package the app (no DMG yet)
npx electron-builder --mac dir --arm64 --publish never
APP=$(ls -d dist/mac*/Surge.app | head -1)
# 2. ad-hoc sign everything inside, then the bundle — BEFORE it goes into the DMG
find "$APP" -name "*.node" -o -name "*.dylib" | while read f; do codesign --force --sign - "$f" 2>/dev/null || true; done
codesign --force --deep --sign - "$APP"
codesign --verify --deep --strict "$APP" && echo "✓ signed"
# 3. wrap the signed app in a DMG
npx electron-builder --mac dmg --arm64 --publish never --prepackaged "$APP"
xattr -cr dist/*.dmg 2>/dev/null || true
echo; echo "Done →"; ls -1 dist/*.dmg
echo "Install: open the DMG, drag Surge to Applications. First launch: right-click → Open."
echo "Logs: ~/Library/Logs/Surge/surge.log"
