#!/bin/bash
set -e

echo "Packaging for Linux (amd64)..."
cd apps/desktop
~/go/bin/wails build -platform linux/amd64
echo "Linux build complete."
