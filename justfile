# SPDX-License-Identifier: 0BSD
# SPDX-FileCopyrightText: 2026 Aryan Ameri <info@ameri.me>
#
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

# =============================================================================
# BUILD
# =============================================================================

# Build standalone binary (native)
build:
    mkdir -p bin
    bun run build

# Build for Linux amd64 (baseline x86_64)
build-linux-amd64:
    mkdir -p bin
    bun run build:linux-amd64

# Build for Linux amd64v3 (x86_64 with AVX2+)
build-linux-amd64v3:
    mkdir -p bin
    bun run build:linux-amd64v3

# Build for Linux arm64 (AArch64)
build-linux-arm64:
    mkdir -p bin
    bun run build:linux-arm64

# Build for all platforms
build-all:
    mkdir -p bin
    bun run build:all

# Build and compress for release (matches CI/CD output)
release-local VERSION:
    echo "{{VERSION}}" | grep -qE '^v?[0-9]+\.[0-9]+\.[0-9]+(-.*)?$' || { echo "ERROR: Version must match [v]X.Y.Z or [v]X.Y.Z-suffix"; exit 1; }
    mkdir -p bin
    @echo "Building all platforms..."
    bun run build:all
    @echo ""
    @echo "Creating release archives with zstd (level 22 --ultra)..."
    just _package-target "{{ trim_start_match(VERSION, "v") }}" linux-amd64
    just _package-target "{{ trim_start_match(VERSION, "v") }}" linux-amd64v3
    just _package-target "{{ trim_start_match(VERSION, "v") }}" linux-arm64
    rm -f bin/divban-linux-amd64 bin/divban-linux-amd64v3 bin/divban-linux-arm64
    @echo ""
    @echo "Generating checksums..."
    cd bin && sha256sum *.tar.zst > SHA256SUMS && cat SHA256SUMS
    @echo ""
    @echo "Release artifacts in bin/:"
    ls -lh bin/

# Internal: package a single target (used by release-local)
_package-target VERSION TARGET:
    @if [ -f "bin/divban-{{TARGET}}" ]; then \
        archive_name="divban-{{VERSION}}-{{TARGET}}"; \
        rm -rf "$${archive_name}"; \
        mkdir -p "$${archive_name}"; \
        cp "bin/divban-{{TARGET}}" "$${archive_name}/divban"; \
        chmod +x "$${archive_name}/divban"; \
        [ -d examples ] && cp -r examples "$${archive_name}/" || true; \
        [ -f README.md ] && cp README.md "$${archive_name}/" || true; \
        tar -cvf - "$${archive_name}" | zstd -22 --ultra -o "bin/$${archive_name}.tar.zst"; \
        rm -rf "$${archive_name}"; \
        echo "  Created: bin/$${archive_name}.tar.zst"; \
    fi

# =============================================================================
# DEVELOPMENT
# =============================================================================

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

# =============================================================================
# CODE QUALITY
# =============================================================================

# Run linter
lint:
    bun run lint

# Run formatter
fmt:
    bun run format

# Check formatting without writing
fmt-check:
    bunx @biomejs/biome format .

# Run type checker
typecheck:
    bun run typecheck

# Run all checks (lint + typecheck)
check: lint typecheck

# Run full CI pipeline
ci: fmt-check lint typecheck test

# Run spell check
spell:
    @echo "Running spell check..."
    bunx cspell "**/*.ts" "**/*.md" --no-progress
    @echo "Spell check passed"

# Run REUSE compliance check
reuse:
    @echo "Running REUSE compliance check..."
    reuse lint
    @echo "REUSE compliance passed"

# Run full CI pipeline with spell check and REUSE
ci-full: spell reuse ci
    @echo ""
    @echo "============================================"
    @echo "All CI checks passed!"
    @echo "============================================"

# =============================================================================
# UTILITIES
# =============================================================================

# Clean build artifacts
clean:
    rm -rf bin
    rm -rf dist coverage

# Generate Quadlet for a service (example)
quadlet service config:
    bun run dev {{service}} generate {{config}}

# Validate config for a service
validate service config:
    bun run dev {{service}} validate {{config}}

# =============================================================================
# RELEASE
# =============================================================================

# Prepare a release (validates, updates version, runs CI)
# Usage: just tag v1.0.0
# For prerelease: just tag v1.0.0-rc1
tag VERSION:
    echo "{{VERSION}}" | grep -qE '^v[0-9]+\.[0-9]+\.[0-9]+(-.*)?$' || { echo "ERROR: Version must match vX.Y.Z or vX.Y.Z-suffix (e.g., v0.5.0, v1.0.0-rc1)"; exit 1; }
    @echo "Preparing release {{VERSION}}..."
    sed -i 's/"version": ".*"/"version": "{{ trim_start_match(VERSION, "v") }}"/' package.json
    @echo "Updated package.json to version {{ trim_start_match(VERSION, "v") }}"
    @echo ""
    @echo "Running CI checks..."
    just ci
    @echo ""
    @echo "============================================"
    @echo "Ready to release {{VERSION}}"
    @echo "============================================"
    @echo ""
    @echo "Run 'just release {{VERSION}}' to commit, tag, and push"

# Full release: validate, update version, run CI, commit, tag, and push
# Usage: just release v1.0.0
release VERSION:
    just tag {{VERSION}}
    git add .
    git commit -m 'Release {{VERSION}}'
    git push
    git tag -a {{VERSION}} -m 'Release {{VERSION}}'
    git push origin {{VERSION}}
    @echo ""
    @echo "============================================"
    @echo "Released {{VERSION}}"
    @echo "============================================"
