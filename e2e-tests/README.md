# divban E2E Testing Framework

Comprehensive end-to-end testing framework for divban across multiple Linux distributions using libvirt/KVM virtualization.

## Overview

This framework automatically:

1. **Discovers services** from `divban-*.toml` files in the current directory
2. **Downloads the latest divban binary** from GitHub releases
3. **Provisions VMs** for each target distribution using cloud images
4. **Executes all CLI commands** for each service on each distribution
5. **Generates reports** in JSON and Markdown formats

## Supported Distributions

- Fedora 43
- Alma Linux 10.1
- Debian 13
- openSUSE Tumbleweed
- Arch Linux (latest)

## Prerequisites

The following tools must be installed on the host system:

### Required Packages

```bash
# Fedora/RHEL/Alma
sudo dnf install libvirt qemu-kvm virt-install virsh curl openssh-clients

# Debian/Ubuntu
sudo apt install libvirt-daemon qemu-kvm virt-manager virtinst curl openssh-client

# openSUSE
sudo zypper install libvirt qemu-kvm virt-install curl openssh

# Arch Linux
sudo pacman -S libvirt qemu-base virt-install curl openssh
```

### Libvirt Setup

1. **Start libvirtd service:**

   ```bash
   sudo systemctl enable --now libvirtd
   ```

2. **Add your user to the libvirt group:**

   ```bash
   sudo usermod -a -G libvirt $(whoami)
   newgrp libvirt
   ```

3. **Verify libvirt is running:**

   ```bash
   virsh list --all
   ```

### Bun Runtime

Install Bun if not already available:

```bash
curl -fsSL https://bun.sh/install | bash
```

## Architecture

### Type System

The framework uses branded types for compile-time safety:

- `VMName` - Virtual machine identifiers
- `DistroName` - Distribution names
- `ServiceName` - Service identifiers
- `CommandName` - CLI command names
- `TestID` - Unique test identifiers
- `ImageURL` - Cloud image URLs
- `IPAddress` - IP addresses

### Modules

- **types.ts** - Core type definitions with branded types
- **distros.ts** - Distribution configurations with cloud image URLs
- **vm-manager.ts** - VM lifecycle management (libvirt/KVM/virt-install)
- **github.ts** - Download latest divban binary from GitHub releases
- **service-discovery.ts** - TOML file scanning and service capability mapping
- **commands.ts** - CLI command generation based on service capabilities
- **test-runner.ts** - Main test orchestration with Effect
- **reporting.ts** - Test result aggregation and output (JSON + Markdown)
- **run.ts** - Entry point with CLI argument parsing

### Functional Programming

The codebase follows divban's strict functional programming patterns:

- **No loops** - Uses `Arr.map`, `Arr.filter`, `Arr.flatMap`, `Effect.all`
- **No conditionals** - Uses `Match.value()`, `Effect.if()`, exhaustive pattern matching
- **Immutable data** - All interfaces use `readonly`, collections use `ReadonlyArray`
- **Effect composition** - All operations use Effect for typed errors and resource management
- **No type assertions** - Type safety enforced through branded types and Schema validators

## Usage

### Basic Usage

From the divban project root directory:

```bash
./e2e-tests/run.ts
```

This will:

1. Discover all `divban-*.toml` files in the current directory
2. Download the latest divban binary from GitHub
3. Test each service on all distributions
4. Generate reports in `./e2e-results/`

### Custom Output Directory

Specify a custom output directory for reports:

```bash
./e2e-tests/run.ts --output /path/to/output
```

### Example TOML Files

Ensure your service TOML files are in the current directory:

```
./divban-caddy.toml
./divban-immich.toml
./divban-actual.toml
```

## Service Capabilities

The framework automatically adjusts tested commands based on service capabilities:

| Service  | Reload | Backup/Restore | Multi-Container |
|----------|--------|----------------|-----------------|
| Caddy    | ✅     | ❌             | ❌              |
| Immich   | ❌     | ✅             | ✅              |
| Actual   | ❌     | ✅             | ❌              |
| FreshRSS | ❌     | ✅             | ❌              |

**Commands tested for all services:**

- `validate`
- `generate`
- `diff`
- `setup`
- `start`
- `stop`
- `restart`
- `status`
- `logs`
- `update`
- `backup-config`
- `remove`
- `remove --force`
- `secret list`
- `secret show`

**Additional commands (capability-dependent):**

- `reload` - Only for services with `hasReload: true`
- `backup` - Only for services with `hasBackup: true`
- `restore` - Only for services with `hasRestore: true`

## VM Management

### VM Configuration

Each VM is provisioned with:

- **Memory:** 2048 MB
- **CPUs:** 2
- **Disk:** 10 GB
- **Network:** libvirt default network
- **Cloud-init:** Automated SSH key setup

### VM Lifecycle

1. **Download cloud image** (cached in `/var/tmp/divban-e2e-images/`)
2. **Generate SSH key pair** (stored in `/var/tmp/divban-e2e-ssh-key`)
3. **Create VM disk** (COW snapshot from base image)
4. **Provision VM** (virt-install with cloud-init)
5. **Wait for IP** (via virsh domifaddr)
6. **Wait for SSH** (retry with exponential backoff)
7. **Run tests** (execute divban commands via SSH)
8. **Destroy VM** (cleanup disk, cloud-init files)

### Resource Cleanup

VMs are automatically destroyed after testing, even on failure. Temporary files are stored in `/var/tmp/`:

- `/var/tmp/divban-e2e-images/` - Cached cloud images
- `/var/tmp/divban-e2e-ssh-key` - SSH key pair
- `/var/tmp/divban-e2e-binary` - Downloaded divban binary
- `/var/tmp/divban-e2e-*` - Per-VM disk and cloud-init files

## Reports

### JSON Report

Structured test results in JSON format:

```json
{
  "startTime": "2026-02-01T12:00:00.000Z",
  "endTime": "2026-02-01T13:30:00.000Z",
  "totalTests": 150,
  "passed": 145,
  "failed": 5,
  "results": [
    {
      "testCase": {
        "id": "fedora-43-caddy-validate",
        "service": "caddy",
        "distro": "fedora-43",
        "command": "validate",
        "args": ["caddy"]
      },
      "success": true,
      "exitCode": 0,
      "stdout": "...",
      "stderr": "",
      "duration": 1234
    }
  ]
}
```

### Markdown Report

Human-readable report with:

- Test summary (total, passed, failed, pass rate)
- Failed test details (if any)
- Complete results table

Example: `./e2e-results/report.md`

## Troubleshooting

### VM Creation Fails

**Issue:** `virt-install` fails with permission denied

**Solution:** Ensure your user is in the `libvirt` group:

```bash
groups | grep libvirt
```

If not present:

```bash
sudo usermod -a -G libvirt $(whoami)
newgrp libvirt
```

### No IP Address Found

**Issue:** VM starts but no IP address is detected

**Solution:** Ensure the libvirt default network is active:

```bash
virsh net-list --all
virsh net-start default
virsh net-autostart default
```

### Cloud Image Download Fails

**Issue:** `curl` fails to download cloud image

**Solution:** Check network connectivity and try manually downloading:

```bash
curl -L -o /tmp/test.qcow2 https://download.fedoraproject.org/pub/fedora/linux/releases/43/Cloud/x86_64/images/Fedora-Cloud-Base-Generic-43-1.1.x86_64.qcow2
```

### SSH Connection Timeout

**Issue:** SSH to VM times out

**Solution:**

1. Verify VM is running: `virsh list`
2. Check VM console: `virsh console <vm-name>` (Ctrl+] to exit)
3. Verify cloud-init completed: Check `/var/tmp/divban-e2e-*-user-data.yaml`

### GitHub Binary Download Fails

**Issue:** Cannot download latest divban binary from GitHub

**Solution:**

1. Check GitHub API rate limits:
   ```bash
   curl -I https://api.github.com/rate_limit
   ```
2. Manually download from [GitHub Releases](https://github.com/aryonoco/divban/releases)
3. Place in `/var/tmp/divban-e2e-binary` and make executable

## Configuration

### GitHub Repository

The GitHub repository is configured in `github.ts`:

```typescript
const GITHUB_REPO = "aryonoco/divban";
```

To test against a fork or different repository, modify this constant.

### Distribution List

To add or remove distributions, edit `distros.ts`:

```typescript
export const ALL_DISTROS: ReadonlyArray<DistroConfig> = [
  FEDORA_43,
  ALMA_10_1,
  DEBIAN_13,
  OPENSUSE_TUMBLEWEED,
  ARCH_LINUX,
] as const;
```

### VM Resources

To adjust VM resources, modify `test-runner.ts`:

```typescript
const vmConfig: VMConfig = {
  name: vmName(`divban-e2e-${distro.name}`),
  distro,
  memory: 2048,  // MB
  cpus: 2,
  disk: 10,      // GB
};
```

## Development

### Type Checking

```bash
cd e2e-tests
bunx tsc --noEmit
```

### Linting

From project root:

```bash
just lint
```

### Adding New Services

1. Add service capabilities to `service-discovery.ts`:

   ```typescript
   const SERVICE_CAPABILITIES: Record<string, ServiceCapabilities> = {
     myservice: {
       hasReload: false,
       hasBackup: true,
       hasRestore: true,
       multiContainer: false,
     },
   };
   ```

2. Place `divban-myservice.toml` in project root
3. Run tests - service will be automatically discovered

### Adding New Distributions

1. Add distribution config to `distros.ts`:

   ```typescript
   export const ROCKY_9: DistroConfig = {
     name: distroName("rocky-9"),
     imageURL: imageURL("https://..."),
     packageManager: DNF,
     packages: ["podman", "systemd", "sudo", "openssh-server"],
     initCommands: [],
   };
   ```

2. Add to `ALL_DISTROS` array
3. Verify cloud image supports cloud-init

## CI Integration

### GitHub Actions Example

```yaml
name: E2E Tests

on:
  push:
    branches: [main]
  pull_request:

jobs:
  e2e:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Install dependencies
        run: |
          sudo apt-get update
          sudo apt-get install -y libvirt-daemon qemu-kvm virt-manager virtinst
          sudo systemctl start libvirtd
          sudo usermod -a -G libvirt $USER

      - name: Install Bun
        uses: oven-sh/setup-bun@v1

      - name: Run E2E tests
        run: ./e2e-tests/run.ts

      - name: Upload reports
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: e2e-reports
          path: e2e-results/
```

## Performance

### Test Duration

Approximate test duration per distribution:

- VM provisioning: 2-5 minutes
- Cloud image download (first run): 1-3 minutes (cached afterward)
- Per-service test suite: 5-10 minutes
- Total (5 distros, 4 services): 60-90 minutes

### Optimization

- **Parallel execution**: Modify `test-runner.ts` to run distros in parallel:

  ```typescript
  Effect.allWith({ concurrency: "unbounded" })
  ```

- **Image caching**: Cloud images are cached in `/var/tmp/` across runs
- **Binary caching**: divban binary is downloaded once and reused

## License

This E2E testing framework is part of the divban project and uses the same license (MPL-2.0).

## Notes

- **No VMware required** - Uses libvirt/KVM exclusively
- **No rpm-ostree layering** - No host system modifications needed
- **Latest GitHub release** - Always tests against the latest published divban binary
- **Comprehensive coverage** - Tests all CLI commands on all distributions
- **Functional programming** - Follows divban's strict coding standards
