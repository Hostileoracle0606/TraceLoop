# Devpost submission draft — TraceLoop

## Project name

TraceLoop

## Tagline

Cursor for firmware: an AI agent that authors, simulates, tests, and explains embedded code.

## Short description

TraceLoop turns firmware development into a closed authoring loop. Describe the behavior you want in plain language; an agent writes Zephyr firmware, builds it in an isolated environment, runs it on a virtual STM32F4 Discovery board in Renode, and explains failures from trace evidence instead of guessing. When the test fails, TraceLoop identifies the causal divergence, proposes the smallest relevant patch, and reruns the simulation.

## Links

- Demo: `[add deployed demo URL]`
- Repository: `[add repository URL]`
- Demo video: `[add video URL]`

## Inspiration

Embedded debugging is still split across hardware setup, toolchain configuration, serial logs, and a lot of educated guessing. A failing test can tell you that an LED did not turn on, but not whether the timer never fired, the interrupt handler was not reached, or the firmware wrote the wrong pin.

We wanted to explore what an AI coding agent would look like for firmware if it could validate its own work without waiting for a physical board. The key idea is not just “generate C.” It is an authoring loop: intent → firmware → build → simulation → test → causal explanation → patch → rerun.

## What it does

TraceLoop lets a user choose a firmware target and describe the desired behavior. The agent can then:

- plan the implementation and acceptance criteria;
- author C/Zephyr firmware for the selected board;
- build the project in an isolated compute plane;
- run the resulting firmware in Renode;
- parse the simulation into a normalized trace-event stream;
- evaluate the expected hardware behavior;
- walk the evidence backward to identify the root cause of a supported failure;
- propose a source patch and rerun within explicit iteration and resource limits.

The interface keeps the user in control with review, guided, and autonomous permission profiles. Every state transition and action is recorded, and the agent cannot silently change the acceptance criteria or claim success from compilation alone.

## The demo

Our demo asks for a simple behavior: turn on the green LED when Timer 2 fires on an STM32F4 Discovery board.

The first firmware version builds successfully and runs in Renode, but the interrupt handler writes GPIO pin 13—the orange LED—instead of pin 12—the green LED. TraceLoop does not simply report “test failed.” It shows the observed interrupt and handler events, the wrong GPIO write, the derived orange-LED effect, and the violated green-LED assertion. The causal engine identifies the pin-13 write as the divergence and explains why it caused the failure.

The agent then changes the handler to write the expected LED, rebuilds and re-simulates the firmware, and confirms the behavior with the same acceptance criteria. The result is a passing run backed by a new trace, not an unverified code-generation claim.

## How we built it

TraceLoop has two deliberately separated planes:

- The control plane contains the React/Vite workspace, TypeScript engine, tRPC API, Supabase/Drizzle persistence, Inngest job orchestration, permissions, and causal analysis.
- The compute plane is an isolated Modal job that receives firmware files, runs the Zephyr build, launches Renode, and returns build output plus the raw simulation trace.

The causal engine consumes a producer-agnostic event format. That means the same analysis can be tested with fixtures and used with a real Renode run. It classifies trace information as observed events, derived effects, and violated assertions, then produces an ordered evidence chain. The root cause is selected by deterministic analysis; language-model output is used for the developer-facing explanation rather than to invent a cause.

The first substrate is C + Zephyr, targeting the STM32F4 Discovery. The frontend uses React, Vite, Monaco, xterm.js, TanStack Query, and shadcn/ui. The backend uses TypeScript, tRPC, Supabase, Drizzle, Inngest, and the Vercel AI SDK. The compute image contains the Zephyr SDK and Renode. Vitest covers the causal engine, Renode parser, state machine, permissions, board capabilities, and authoring loop.

## Challenges we ran into

The hardest part was making the simulation useful as evidence rather than treating it as a black box. Renode emits low-level peripheral activity, while the user needs an explanation in terms of “Timer 2 fired, the handler ran, and the wrong LED pin was written.” We created a normalization seam between the producer and analyzer and wrote the parser around the real STM32F4 trace.

We also had to make the agent loop safe and honest. Builds can fail before a trace exists, simulations can time out, patches need approval depending on the selected permission profile, and iteration budgets must stop unproductive loops. Those cases are explicit states in the implementation instead of being hidden behind a generic success/failure flag.

## Accomplishments

- We built a real Zephyr → Renode → trace parser path for the demo firmware.
- We made the causal analyzer producer-agnostic and deterministic.
- We can distinguish a wrong register/pin write from a build failure and avoid analyzing nonexistent traces.
- We implemented a bounded, stateful authoring loop with permission checks, cancellation, resource limits, and an audit trail.
- We demonstrated a failure explanation that points to a concrete source-level correction rather than a generic test failure.
- We built and validated the core flow without requiring physical hardware.

## What we learned

The most valuable abstraction is the trace-event seam. Once simulation output is normalized, the same causal model can power the timeline, virtual-board view, failure explanation, and future agent tools. We also learned that trustworthy autonomy needs visible boundaries: the agent should show what it knows, what it is allowed to change, and what evidence made it stop.

## What's next

Next we would expand beyond the STM32F4 demo target, add more peripheral and board mappings, support missing-write failures where the expected event never occurs, and make the full patch-approval/rerun flow durable in the product UI. We would also add synchronized failed-versus-passing run comparison and validate generated firmware on physical hardware before deployment.

## Built with

TypeScript · React · Vite · C · Zephyr · Renode · Modal · tRPC · Supabase · Drizzle · Inngest · Vercel AI SDK · Vitest

## Suggested submission note

TraceLoop is a software-only prototype. The virtual board is excellent for rapid iteration and causal debugging, but generated firmware should still be validated on the target hardware before deployment.
