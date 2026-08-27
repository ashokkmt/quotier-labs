#!/bin/bash
set -e
echo "Generating TypeScript types from Go..."
cd apps/desktop
~/go/bin/wails generate module
