#!/bin/bash
set -e

echo "Packaging for macOS (Universal)..."
cd apps/desktop
~/go/bin/wails build -platform darwin/universal -clean
echo "macOS build complete."
