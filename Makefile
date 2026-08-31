.PHONY: build dev dev-reset dev-open-data test lint generate migrate release check-runtime-paths

build:
	@./scripts/build-local.sh

dev:
	@./scripts/dev.sh

dev-reset:
	@./scripts/dev-reset.sh

dev-open-data:
	@open .devdata/quotier-labs 2>/dev/null || xdg-open .devdata/quotier-labs

test:
	@echo "Running Go tests..."
	go test -race ./...
	@echo "Running frontend tests..."
	cd frontend && npm run test --if-present

lint:
	@./scripts/check-runtime-paths.sh
	@echo "Running Go linter..."
	go run github.com/golangci/golangci-lint/cmd/golangci-lint@latest run ./...
	@echo "Running frontend linter..."
	cd frontend && npm run lint

generate:
	@echo "Generating types..."
	./scripts/generate-types.sh

migrate:
	@echo "Running migrations..."
	@mkdir -p "$(CURDIR)/.devdata/quotier-labs/data/db" && printf '%s\n' 'Quotier Labs development data' > "$(CURDIR)/.devdata/quotier-labs/.quotier-devdata"
	goose -dir migrations sqlite3 "$(CURDIR)/.devdata/quotier-labs/data/db/quotierlabs.sqlite3" up

check-runtime-paths:
	@./scripts/check-runtime-paths.sh

release:
	@QL_RELEASE_BUILD=1 ./scripts/build-release.sh
