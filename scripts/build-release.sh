#!/bin/bash
# Quotier Labs - Master Release Script
set -e

echo "Starting Quotier Labs Release Build..."

# Run tests before building
echo "Running tests..."
cd backend && go test ./...
cd ../frontend && npm run test
cd ..

# Run platform-specific package scripts
./scripts/package-macos.sh
# ./scripts/package-windows.sh
# ./scripts/package-linux.sh

echo "Release build complete! Check apps/desktop/build/bin/ for output files."
