#!/bin/bash
set -e

echo "Packaging for Windows (amd64)..."
cd apps/desktop
# Note: NSIS is required on the host machine to build the windows installer (.exe)
# wails build handles the .exe generation if NSIS is installed.
~/go/bin/wails build -platform windows/amd64 -nsis
echo "Windows build complete."
