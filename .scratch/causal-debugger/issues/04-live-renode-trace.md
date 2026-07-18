# 04 — Live Renode trace replaces synthetic input

**What to build:** Boot the STM32F4 Timer2 wrong-pin firmware in Renode, extract the real execution trace into the normalized event schema, and feed it through the same engine → view-model → dashboard path from ticket 03 — so the whole demo runs off a real emulated run instead of a synthetic sequence. This is the moment TraceLoop stops being a fixture demo and becomes real.

**Blocked by:** 03 (end-to-end synthetic path). Also gated by the wayfinder decisions `traceloop/01` (Renode trace-extraction API) and `traceloop/03` (demo firmware binary).

**Status:** done (verified in-browser on a real emulated run)

- [x] STM32F4 firmware with the planted Timer2 wrong-pin fault runs under Renode — bare-metal `firmware/main.c` + `stm32f407.ld`, compiled with arm-none-eabi-gcc 16.1 → `firmware/timer2-wrong-pin.elf` (`timer_isr` @ 0x8000140), run headless in Renode v1.16.1 via `renode/timer2.resc`.
- [x] Register / GPIO / interrupt events extracted — `LogPeripheralAccess` (timer2/nvic/gpioPortG) + `LogFunctionNames` → `src/engine/renode-parser.ts` (TDD'd, 2 tests) → normalized `TraceEvent[]`. Real log confirms `gpioPortG WriteUInt32 to OutputData value 0x2000` = pin 13.
- [x] The failing assertion is detected — `analyze()` on the real trace returns `status: failed`.
- [x] The dashboard shows the correct root cause from the live trace — verified in-browser (no console errors); the event inspector renders the parser's real-run text ("main.c:37 wrote GPIOG_ODR pin 13"), root cause = the pin-13 write. `frontend/src/renode-trace.json` is the captured real trace; `run.ts` feeds it through the live engine.
