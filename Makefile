.PHONY: build dev test lint generate migrate

build:
	@echo "Building Wails app..."
	cd apps/desktop && ~/go/bin/wails build

dev:
	@echo "Starting Wails dev server..."
	cd apps/desktop && ~/go/bin/wails dev

test:
	@echo "Running Go tests..."
	go test -race ./...
	@echo "Running frontend tests..."
	cd frontend && npm run test --if-present

lint:
	@echo "Running Go linter..."
	go run github.com/golangci/golangci-lint/cmd/golangci-lint@latest run ./...
	@echo "Running frontend linter..."
	cd frontend && npm run lint

generate:
	@echo "Generating types..."
	./scripts/generate-types.sh

migrate:
	@echo "Running migrations..."
	goose -dir migrations sqlite3 quotierlabs.db up
