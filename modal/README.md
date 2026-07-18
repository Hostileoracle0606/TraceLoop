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

This prints the web endpoint URL. Copy it and set it as the `MODAL_ENDPOINT` env var, or pass it directly to `ModalFirmwareJobRunner`:

```typescript
const runner = new ModalFirmwareJobRunner("https://<your-app>.modal.run/firmware_job");
```

## Image build time

The first deploy builds the Modal image — Zephyr SDK + Renode + dependencies. This takes ~5–10 minutes. Subsequent deploys are fast (cached layers).

## How it works

1. Receives `FirmwareJobRequest` JSON: `{ files, board }`
2. Writes source files to a temp workspace
3. Runs `west build -b <board>` (5-minute timeout)
4. If build succeeds, generates a `.resc` script and runs Renode (60-second timeout)
5. Returns `FirmwareJobResult`: `{ build: { ok, log }, trace?: { log } }`

All causal analysis stays in the control plane — this is a pure toolchain runner.
