# TraceLoop Modal Compute Plane

Isolated firmware build + Renode simulation. See `docs/adr/0004`.

## Prerequisites

```bash
pip install modal
modal setup  # authenticate
```

## Deploy

```bash
modal deploy modal/app.py
```

This prints the web endpoint URL. Pass it directly to `ModalFirmwareJobRunner`:

```typescript
const runner = new ModalFirmwareJobRunner("https://hostileoracle0606--traceloop-firmware-job-firmware-job.modal.run");
```

Deployment dashboard: https://modal.com/apps/hostileoracle0606/main/deployed/traceloop-firmware-job

## Image build time

The first deploy builds the Modal image — Zephyr SDK + Renode + dependencies. This takes ~5–10 minutes. Subsequent deploys are fast (cached layers).

## How it works

1. Receives `FirmwareJobRequest` JSON: `{ files, board }`
2. Writes source files to a temp workspace
3. Runs `west build -b <board>` (5-minute timeout)
4. If build succeeds, generates a `.resc` script and runs Renode (60-second timeout)
5. Returns `FirmwareJobResult`: `{ build: { ok, log }, trace?: { log } }`

All causal analysis stays in the control plane — this is a pure toolchain runner.

## Gotchas (learned the hard way)

- **Python 3.12+ is required in the image.** West's `build.py` calls `pathlib.relative_to(..., walk_up=True)`, which only exists in Python 3.12+. On `debian_slim(python_version="3.11")` every build dies with `TypeError: ... unexpected keyword argument 'walk_up'` before compiling anything.
- **Install the SDK with `west sdk install`, not a pinned tarball.** `west init` (no `--mr`) clones Zephyr *main*, which moves. A hardcoded SDK (e.g. 0.17.0) drifts out of sync — CMake rejects it with *"Could not find a configuration file for package Zephyr-sdk compatible with requested version 1.0"*. `west sdk install` fetches the SDK the cloned tree actually wants and registers it in the CMake package registry (so `ZEPHYR_SDK_INSTALL_DIR` is unnecessary). To make builds reproducible, also pin Zephyr with `west init --mr <tag>`.
- **Pass `--no-hosttools` to `west sdk install` in the container.** The SDK's host-tools installer (`setup.sh -h`: qemu/openocd/etc.) fails in the minimal image and isn't needed to *build* — the image already apt-installs `cmake`/`ninja`/`dtc`. The GNU toolchain and CMake registration still happen without it.
