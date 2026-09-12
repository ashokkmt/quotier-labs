.PHONY: build dev dev-reset dev-open-data test lint generate migrate release unsigned-release-macos unsigned-release-windows check-runtime-paths perf-bench perf-size

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
	go run github.com/pressly/goose/v3/cmd/goose@v3.27.3 -dir migrations sqlite3 "$(CURDIR)/.devdata/quotier-labs/data/db/quotierlabs.sqlite3" up

check-runtime-paths:
	@./scripts/check-runtime-paths.sh

release:
	@QL_RELEASE_BUILD=1 ./scripts/build-release.sh

unsigned-release-macos:
	@./scripts/package-unsigned-macos.sh

unsigned-release-windows:
	@./scripts/package-unsigned-windows.sh

perf-bench:
	go test -bench=. -benchmem ./backend/application/layoutir ./backend/infrastructure/pdf

perf-size:
	node scripts/perf/report-size.mjs build/bin
