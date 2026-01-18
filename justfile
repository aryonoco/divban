# divban - Unified Podman service manager
# Run 'just' to see all available commands

set shell := ["bash", "-euo", "pipefail", "-c"]

# Default recipe: show help
default:
    @just --list

# Show tool versions
versions:
    @echo "Bun:        $(bun --version)"
    @echo "TypeScript: $(bunx tsc --version)"
    @echo "Biome:      $(bunx @biomejs/biome --version)"
    @echo "Podman:     $(podman --version 2>/dev/null || echo 'not available')"
    @echo "Just:       $(just --version)"

# Install dependencies
setup:
    bun install

# Build standalone binary
build:
    bun run build

# Build for all platforms
build-all:
    bun run build:all

# Build for Linux x64
build-linux-x64:
    bun run build:linux-x64

# Build for Linux ARM64
build-linux-arm64:
    bun run build:linux-arm64

# Run in development mode
dev *args:
    bun run dev {{args}}

# Run tests
test:
    bun test

# Run tests in watch mode
test-watch:
    bun test --watch

# Run tests with coverage
test-coverage:
    bun test --coverage

# Run linter
lint:
    bun run lint

# Run formatter
fmt:
    bun run format

# Check formatting without writing
fmt-check:
    bunx @biomejs/biome check .

# Run type checker
typecheck:
    bun run typecheck

# Run all checks (lint + typecheck)
check: lint typecheck

# Run full CI pipeline
ci: fmt-check lint typecheck test

# Clean build artifacts
clean:
    rm -f divban divban-linux-x64 divban-linux-arm64
    rm -rf dist coverage

# Generate Quadlet for a service (example)
quadlet service config:
    bun run dev {{service}} generate {{config}}

# Validate config for a service
validate service config:
    bun run dev {{service}} validate {{config}}
