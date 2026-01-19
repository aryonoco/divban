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

# Run type checker
typecheck:
    bun run typecheck

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

# Run full CI pipeline
ci: spell reuse fmt lint typecheck test
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

# =============================================================================
# RELEASE
# =============================================================================

# Prepare a release: validate version, update package.json, run CI
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

# Full release: run tag, commit, git tag, and push
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
