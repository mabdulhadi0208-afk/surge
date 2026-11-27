#!/bin/bash
# Builds Surge Dock's native parts (macOS only; CI runs it on macos-latest). Any failure stops the release build.
#   native/bin/surge-dock          the helper (native/surge-dock.swift), universal
#   native/bin/surge-dockwin.node  the window add-on (native/dockwin.mm), universal, Node-API so it loads in any Electron
set -euo pipefail
cd "$(dirname "$0")"
mkdir -p bin build
MIN=11.0
for arch in arm64 x86_64; do
  echo "== swiftc $arch"
  xcrun swiftc -O -swift-version 5 -target "$arch-apple-macos$MIN" -module-name SurgeDock \
    -framework AppKit -framework ApplicationServices -framework CoreGraphics surge-dock.swift -o "build/surge-dock-$arch"
done
lipo -create build/surge-dock-arm64 build/surge-dock-x86_64 -output bin/surge-dock
chmod 755 bin/surge-dock
HDR=$(cd .. && node -p "require('path').dirname(require.resolve('node-api-headers/package.json'))")/include
echo "== clang++ dockwin.mm (headers: $HDR)"
xcrun clang++ -ObjC++ -fobjc-arc -std=c++17 -O2 -bundle -undefined dynamic_lookup -arch arm64 -arch x86_64 \
  -mmacosx-version-min=$MIN -DNAPI_VERSION=8 -I "$HDR" dockwin.mm -framework AppKit -o bin/surge-dockwin.node
for f in bin/surge-dock bin/surge-dockwin.node; do
  lipo -info "$f"
  lipo -info "$f" | grep -q arm64 && lipo -info "$f" | grep -q x86_64 || { echo "::error::$f is not universal"; exit 1; }
done
