# Zephyr is the firmware substrate

The agent authors firmware against **Zephyr** (Apache-2.0 OSS RTOS), replacing the bare-metal register-poke firmware from the first Renode run (`causal-debugger/04`).

Why: (1) it matches the API the reused dashboard already assumes (`gpio_pin_set_dt`, device tree); (2) Zephyr is well-represented in LLM training data, so *agent authoring* is far more reliable than bare-metal register pokes; (3) it is open-source with a full driver/board ecosystem and first-class Renode support, satisfying the "build on open source" goal.

## Status: implemented (2026-07-17)

`firmware-zephyr/timer2-wrong-pin/` builds clean against Zephyr (west build, `stm32f4_disco` board — real STM32F407, GPIOG present) and runs in Renode with the identical planted bug (`gpio_pin_set_dt(&orange_led, 1)` instead of `&green_led`). `renode-parser.ts` was extended to decode Zephyr's `gpio_stm32` driver writes (BSRR-style `BitSet`/`BitReset`, not a direct `OutputData` write like bare-metal) — same `TraceEvent[]` output, so `analyze()`/`toDashboardRun()`/the dashboard needed zero changes. The live dashboard now runs off this real Zephyr trace.

Note: the real STM32F4-Discovery wires its LEDs to GPIOD, not GPIOG. We deliberately kept GPIOG (via a devicetree overlay) for consistency with the engine, tests, and dashboard already built around `GPIOG_ODR[12]/[13]` — a simulation-only choice with no effect on the causal analysis.

## Considered and rejected

- **Bare-metal C** (what `causal-debugger/04` used) — unforgiving for an LLM to author correctly, and diverges from the mockup's Zephyr API.
- **QNX** — scrapped entirely, not even a roadmap producer. Its kernel is proprietary (conflicts with build-on-OSS), it does not run in Renode (would force a QEMU pivot + a new `.kev` producer + a reworked, thread-oriented frontend), and its kernel-event model doesn't match the GPIO dashboard. `NuttX` was noted as the fully-OSS POSIX alternative if QNX's model were ever wanted, but it is not being pursued.
