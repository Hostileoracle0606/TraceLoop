# Modal is the compute plane; the engine stays in the control plane

The firmware build (Zephyr `west build`) and Renode simulation run in an isolated **Modal** container. The causal engine — `analyze()`, `parseRenodeLog()`, `toDashboardRun()` — runs only in the control plane (the app itself). Modal is a pure toolchain runner: it takes source, returns build logs and raw trace logs.

Why: (1) the Zephyr SDK + Renode are large, slow-to-install toolchains that shouldn't pollute the app's runtime environment; (2) isolation means the agent can build untrusted firmware without affecting the host; (3) Modal's container-per-request model maps cleanly to one job = one build + one sim; (4) keeping all causal analysis in the control plane means the IP lives in one place, is testable without booting containers, and the compute plane is replaceable.

## The seam

`FirmwareJobRunner` (`src/engine/firmware-job.ts`) is the boundary. The control plane sends a `FirmwareJobRequest` (source files + board target) and receives a `FirmwareJobResult` (build ok/log + optional trace log). `outcomeFromJob()` converts the result into a `RunOutcome` the agent loop consumes.

The compute plane never runs the analyzer. It never sees assertions, causal chains, or the dashboard view-model. It is a black box that compiles and simulates.

## Container image

The Modal image installs:
- Zephyr SDK (west, toolchain, Zephyr source)
- Renode (portable .app or Linux binary)
- CMake + Ninja

Build steps inside the container:
1. Write `FirmwareJobRequest.files` into a temp workspace
2. `west build -b <board> -d build/`
3. If build fails: return `{ build: { ok: false, log } }`
4. If build succeeds: run Renode with the `.resc` script, capture stdout
5. Return `{ build: { ok: true, log }, trace: { log } }`

## Consequences

- The engine's test suite (synthetic fixtures + real Renode log fixtures) runs without Modal, without Zephyr, without Renode. Fast feedback, no container boot.
- The Modal app is stateless: one request, one response. No persistence, no queue.
- Swapping the compute plane (Modal → local Docker → CI runner) is a `FirmwareJobRunner` implementation change, not an engine rewrite.
