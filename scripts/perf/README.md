# Performance workflows

These checks are local, report-only evidence; they do not collect telemetry or define release gates.

Run `go test -bench=. -benchmem ./backend/application/layoutir ./backend/infrastructure/pdf` for the baseline resolver/PDF allocation reports. Run `node scripts/perf/report-size.mjs <artifact-directory>` after a packaged build to write `artifact-sizes.json`.

For a release candidate, use Developer diagnostics to record these fixtures: blank, typical, image-heavy, 500-row table, and multi-page. Capture a warm idle baseline, run the 20-cycle open/edit/preview/export/save/close workflow in `plans/monitoring.md`, wait for quiescence, and export the one local session ZIP. Run a separate two-hour idle-with-document-open check and 100 PDF preview/export generations. Treat a persistent post-warmup trend in Go live heap, tree RSS, goroutines, or handles/FDs as a reproduction trigger, then use the guarded profile controls and the OS-native tools documented in `plans/monitoring.md`.
