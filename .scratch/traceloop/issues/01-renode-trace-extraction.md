# 01 — How does Renode expose the trace events we need, and via what API?

Type: research
Status: resolved (2026-07-17)
Blocked by: None — can start immediately

## Question

The whole live demo (build ticket `causal-debugger/02`) depends on getting per-event trace data out of Renode at the right granularity: register writes, GPIO pin writes, and interrupt entry/exit for the STM32F4 target. Which Renode mechanism yields these, and in what form?

Candidates to evaluate: execution tracing (`sysbus.cpu` execution tracing / `EnableProfiler`), peripheral access logging (`LogPeripheralAccess`), GDB stub + stepping, Python/C# hooks on peripheral accesses, and the Robot test framework's introspection. For each: does it emit register-write and GPIO-write events with the timing/ordering the normalized schema needs, and can it be driven programmatically (not just interactive console)?

**Resolves:** the extraction approach for `causal-debugger/02`, and confirms the normalized event schema's fields are actually populatable from a real run. This is the single biggest risk to the 36h build — resolve first.

**How to resolve:** AFK research pass over Renode docs and examples (this is a `/research` ticket; fire it before touching build ticket 02). Capture findings and a minimal working extraction snippet as the resolution.

## Answer

**Yes — Renode emits every event class our normalized schema needs, via documented mechanisms. Risk downgraded from HIGH to LOW-MEDIUM.** Two complementary sources, both scriptable:

1. **Peripheral / register access → `LogPeripheralAccess`.** `sysbus LogPeripheralAccess sysbus.gpioG true` (or `sysbus LogAllPeripheralsAccess true`) logs every read/write with the **register name and value**, e.g. `gpioG: WriteUInt32 to 0x14 (ODR), value 0x2000`. This yields our `gpio-write` (GPIOG_ODR[13]), `timer` (TIM2_SR.UIF), and `interrupt` (NVIC_ISPR0[28]) events — register + value + the CPU PC of the access. Register *names* appear when the peripheral model has a RegistersDescription.
2. **Handler entry / PC → execution tracing.** `cpu CreateExecutionTracing "t" @out <mode>` logs executed function names once symbols are loaded (`sysbus LoadELF @fw.elf`). Add `TrackMemoryAccesses` / `TrackRegisters` for register values. This yields the `handler-entry` event (PC resolves to `timer_isr`, e3).

**Extraction approach chosen:** register **hooks** over log-scraping where possible — `sysbus.gpioG` / register-access hooks (and RISC-V/Cortex register hooks) can fire a callback that pushes a *structured* event, avoiding brittle log parsing. Fallback: parse `LogPeripheralAccess` output (stable format). **Timestamps** come from Renode's virtual time (log timestamps / `machine ElapsedVirtualTime`). **Driven programmatically** via the Robot framework (`renode-test`) or a `.resc` script + monitor; hooks can be Python.

**Net for `causal-debugger/04`:** every field of `TraceEvent` (`time/type/source/register/value`) is populatable from a real STM32F4 run. The open sub-question is only *engineering* (align timestamps, choose hook-vs-parse) — not feasibility. (QNX was considered as a separate producer but is now scrapped — see `docs/adr/0002`.)

Sources: [Renode execution tracing docs](https://renode.readthedocs.io/en/latest/execution-tracing/execution-tracing.html), [Renode logger docs (LogPeripheralAccess)](https://renode.readthedocs.io/en/latest/basic/logger.html), [Antmicro: methods of execution tracing](https://renode.io/news/execution-tracing-in-renode/), [Memfault: Cortex-M emulation with Renode](https://interrupt.memfault.com/blog/intro-to-renode).
