# Vercel AI SDK for the LLM layer; the LLM serves the FSM, not vice versa

The agent's LLM capability is provided by the **Vercel AI SDK** (`ai` package) with a provider-agnostic abstraction. The LLM is called within 4 of the FSM's 11 states (`clarification-needed`, `planning`, `editing`, `patching`) and produces structured output the FSM consumes. The LLM does not decide state transitions — the FSM is explicit function calls.

Why Vercel AI SDK: (1) TypeScript-native with first-class support for `generateText`, `generateObject`, and tool-use; (2) provider-agnostic — swap Anthropic Claude ↔ OpenAI GPT-4.1 via env config; (3) streaming support for real-time UI feedback; (4) no LangChain/LangGraph overhead — those frameworks add abstraction layers that obscure the simple request/response pattern TraceLoop needs. Skip them.

## The LLM-serves-FSM contract

The FSM (`src/engine/agent-state.ts`) is the authority. The LLM is a tool the FSM invokes within specific states:

| FSM State | LLM Function | AI SDK Method | Output |
|---|---|---|---|
| `clarification-needed` | `clarifyIntent()` | `generateText` | Questions or `null` (clear) |
| `planning` | `generatePlan()` | `generateObject` | `{ steps[], summary }` |
| `editing` | `editSource()` | `generateText` + tools | File operations |
| `patching` | `proposePatchLLM()` | `generateObject` | `{ file, before, after, summary, confidence }` |

The other 7 states (`building`, `simulating`, `analyzing`, `rerunning`, `completed`, `blocked`, `stopped`) are deterministic or compute-only — no LLM involved.

## Provider abstraction

`backend/llm/provider.ts` is a factory that returns a `LanguageModelV1` based on `LLM_PROVIDER` env var:
- `anthropic` (default) → `claude-sonnet-4-20250514`
- `openai` → `gpt-4.1`

The model is cached as a singleton. `resetLLMProvider()` is available for testing.

## System prompts

Each FSM state has a dedicated system prompt (`backend/llm/prompts.ts`) that constrains the LLM to the firmware domain and the specific task. Prompts include Zephyr RTOS conventions, register/peripheral context, and explicit constraints (don't modify tests, don't weaken assertions).

## Tool definitions

The `editing` state uses AI SDK tool-use (`backend/llm/tools.ts`) with two tools:
- `write_file(path, content)` — create or overwrite a file
- `edit_file(path, search, replace)` — surgical search-and-replace

Tools return structured `FileOperation` results. The LLM can make up to 10 tool calls per editing session (`maxSteps: 10`).

## tRPC integration

`backend/trpc/routers/agent.ts` exposes 4 procedures (`clarify`, `plan`, `edit`, `patch`). Each procedure:
1. Validates the task is in the correct FSM state
2. Checks project ownership
3. Calls the corresponding LLM function
4. Returns structured output

## Consequences

- The LLM is a replaceable component — swap providers or models without changing the FSM or pipeline.
- Structured outputs (`generateObject`) ensure the LLM's response matches the schema the FSM expects. No parsing ambiguity.
- System prompts are the primary control mechanism for LLM behavior within each state. They are versioned and testable.
- The `editing` state's tool-use pattern allows the LLM to make multiple file changes in a single call, with each change tracked as a structured operation.
- LangChain/LangGraph would add unnecessary abstraction (chains, agents, memory) for a use case that is fundamentally request/response with structured outputs.
- The LLM never sees the full FSM — it only knows about its assigned state and the inputs/outputs for that state. This prevents the LLM from "deciding" to skip states or loop.
