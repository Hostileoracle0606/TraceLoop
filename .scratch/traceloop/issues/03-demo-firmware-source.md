# 03 — Where does the STM32F4 Timer2 wrong-pin demo firmware come from?

Type: task
Status: resolved (2026-07-17)
Blocked by: None — can start immediately

## Question

Every live build ticket needs a concrete firmware binary that exhibits the planted fault: a Timer2 interrupt handler that writes GPIO pin 13 instead of pin 12. Decide and produce the source: write it in C and compile with the ARM toolchain, or adapt an existing Renode STM32F4 sample binary and inject the fault. Also produce the matching "correct" build (writes pin 12) so the pass/fail contrast is demoable.

This is a *task* ticket — nothing to decide once the approach is picked; it unblocks the live demo by producing an artifact the discussion (and the build) waits on.

**Resolves:** provides the demo binary that build tickets `causal-debugger/02` and `05` depend on. Record where the built binary and its source live as the resolution.

## Answer

**Built from scratch.** Bare-metal STM32F407 in C — `firmware/main.c` (vector table with TIM2 at IRQ 28, `main` sets up TIM2 + GPIOG + NVIC, `timer_isr` writes GPIOG pin 13 = `0x2000` instead of pin 12) + linker `firmware/stm32f407.ld`. Compiled with `arm-none-eabi-gcc 16.1` (installed via brew) → `firmware/timer2-wrong-pin.elf` (`timer_isr` @ 0x8000140). Runs headless in **Renode v1.16.1** (installed as a portable macOS `.app` from the DMG — no sudo, no mono) via `renode/timer2.resc`. The matching "correct" build (pin 12) is a one-line change, deferred — the failing run is the demo.
