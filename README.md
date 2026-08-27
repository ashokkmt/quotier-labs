# Quotier Labs

Quotier Labs is a high-performance, offline-first desktop application designed for SMBs in India to create highly customizable, professional business quotations and PDF documents.

## Tech Stack
- **Frontend:** React + TypeScript + Vite + Tailwind CSS + shadcn/ui
- **Backend:** Go (Domain/Application layer) + SQLite + Wails (Transport)
- **PDF Engine:** Go native `go-fpdf` (No Chromium required)
- **Architecture:** Clean Architecture principles

## Folder Structure

```text
/
├── apps/
│   └── desktop/           # Wails application entry point and build configurations
│       ├── main.go        # App bootstrap and Wails integration
│       └── build/         # Wails target output (App icons, compiled binaries)
├── backend/               # Go backend adhering to Clean Architecture
│   ├── application/       # Application logic, use cases, orchestrations, and DTOs
│   ├── domain/            # Core entities, value objects, domain logic, and repo interfaces
│   ├── infrastructure/    # Concrete repository implementations (SQLite), PDF gen, CSV IO
│   └── transport/wails/   # Transport boundary mappings (Wails handlers for the frontend)
├── frontend/              # React frontend
│   ├── src/
│   │   ├── components/    # Reusable shadcn/ui and custom primitives
│   │   ├── features/      # Feature-based module grouping (e.g., quotations, customers, templates)
│   │   ├── lib/           # Utility functions
│   │   └── App.tsx        # React application root & routing
├── migrations/            # SQLite schema migration scripts (Goose)
├── plans/                 # Project history, worklogs, and architecture specification
└── scripts/               # Automation scripts for packaging and release
```

## How It Works

Quotier Labs relies on **Wails** to act as a bridge between a fast, modern React frontend and a highly concurrent, memory-safe Go backend. 
- The **Frontend** calculates UI advisory states (for fast responsiveness) and uses Zod to validate input before delegating requests.
- The **Backend** is the absolute source of truth. It receives IPC calls from the frontend, validates inputs rigorously via Domain-driven rules, coordinates with the SQLite local database, and returns normalized DTOs.
- **Documents & PDFs** are constructed entirely natively on the Go backend using `fpdf`, ensuring pixel-perfect representations independent of local browser render engines, saving massive bundle overhead.

## Development Guide

### Prerequisites
- [Go 1.25+](https://go.dev/)
- [Node.js 20+](https://nodejs.org/)
- [Wails v2 CLI](https://wails.io/docs/gettingstarted/installation)

### Running in Development Mode
To launch the application with Hot-Module-Reloading (HMR) for both Go and React:
```bash
# Navigate to the desktop app package
cd apps/desktop

# Start the Wails dev server
wails dev
```
The application will launch. Any changes you make to `frontend/` will instantly reflect in the UI. Changes to `backend/` will auto-recompile the Go binary.

### Code Generation & Bindings
If you change any exported Go structs, DTOs, or Wails Handlers (`backend/transport/wails`), run a build or dev loop to regenerate the TypeScript bindings:
```bash
cd apps/desktop
wails generate module
```

## Building & Release

The application includes cross-platform build scripts inside `/scripts/`. 

To package the application for production, you can run the master release script which orchestrates tests and building for multiple platforms:
```bash
./scripts/build-release.sh
```

Or you can build for specific platforms individually:
```bash
./scripts/package-macos.sh
./scripts/package-windows.sh
./scripts/package-linux.sh
```

*(Note: Building Windows `.exe` installers on a Mac/Linux host requires NSIS to be installed locally).*

The resulting production binaries will be placed in `apps/desktop/build/bin/`.
