# TraceLoop — Intended User Interaction Flow

This document describes the intended behavior of TraceLoop as a sequence of user actions and system responses. It is not a visual design specification.

The central promise is an authoring loop:

`user intent → tests/acceptance criteria → firmware → build → Renode simulation → analysis → patch → rerun`

The first supported substrate is C + Zephyr on the STM32F4 Discovery. Other boards and languages are later extensions of the same flow.

## Actors

- **User** — provides intent, answers clarification questions, selects permissions, reviews evidence, and may approve or reject changes.
- **Agent** — plans, authors firmware, writes tests, interprets build/simulation feedback, and proposes patches.
- **Compute plane** — isolated job runner that builds the submitted firmware and runs Renode.
- **Causal engine** — deterministic control-plane analysis over the normalized trace-event stream.

## Primary journey

Example intent: “Make the green LED turn on when Timer 2 fires.”

| Step | User action | Interface response | System/agent behavior | Resulting state |
|---|---|---|---|---|
| 1. Start | Opens TraceLoop and chooses **New project**. | Shows the project setup flow. | Loads available substrates and boards. | `project-setup` |
| 2. Choose target | Selects C, Zephyr, and STM32F4 Discovery. | Confirms the selected target and its capabilities. | Creates or loads the project scaffold and board configuration. | `target-selected` |
| 3. State intent | Types the desired behavior in plain language. | Shows the captured request and starts an agent session. | Parses the request for behavior, constraints, and missing details. | `intent-received` |
| 4. Clarify if needed | Answers any question the agent asks. | Shows why the answer is needed and records it in the task context. | Updates the task contract; does not write firmware while required information is missing. | `intent-confirmed` |
| 5. Review plan | Inspects the proposed implementation and test plan. | Shows planned files, tests, simulator assertions, and expected evidence. | Produces tests before implementation where practical. | `plan-ready` |
| 6. Select autonomy | Chooses review-each-action, guided approval, or autonomous execution. | Explains what each mode can approve automatically. | Applies the chosen permission profile to every tool action. | `permissions-set` |
| 7. Approve/start | Approves the plan, or starts autonomous execution. | Shows the active task and current iteration. | Creates an isolated working copy and records the initial state. | `authoring` |
| 8. Author tests | Reviews generated tests when the permission profile requires it. | Shows test intent and the behavior each test asserts. | Writes tests and protects approved tests from silent weakening. | `tests-ready` |
| 9. Author firmware | Approves or observes the agent editing source files. | Shows the diff and the reason for each relevant change. | Writes Zephyr firmware and required project files. | `source-ready` |
| 10. Build | Clicks **Build and run**, or lets autonomous mode continue. | Shows compiler output and a cancellable job indicator. | Submits source files and board target to the isolated compute plane. | `building` |
| 11. Handle build result | Reads errors if the build fails. | Displays the compiler log and the failing files/lines. | Converts the failure into feedback for the next agent iteration; never analyzes a nonexistent trace. | `build-failed` or `simulating` |
| 12. Simulate | Waits for or stops the Renode run. | Shows simulation progress, elapsed time, and a stop action. | Runs the ELF, captures the raw trace, and returns it to the control plane. | `simulated` |
| 13. Evaluate behavior | Reviews the test result and observed hardware state. | Shows pass/fail, assertion details, and trace availability. | Parses the trace, evaluates assertions, and runs deterministic causal analysis. | `passed` or `failed` |
| 14. Inspect failure | Opens **Failure analysis** when behavior is wrong. | Synchronizes timeline, virtual board, event inspector, and causal chain around the selected event. | Identifies the supported root cause and displays observed, derived, and violated nodes. | `analysis` |
| 15. Ask why | Selects an event or asks the agent to explain the failure. | Shows a plain-language answer tied to trace evidence. | Narrates the deterministic chain; it does not invent a root cause. | `explanation-ready` |
| 16. Choose response | Views source, compares with a passing run, or requests a patch. | Opens the selected evidence-backed action. | Builds a proposed patch from the root event and expected behavior. | `patch-proposed` or `comparison` |
| 17. Review patch | Reviews, edits, approves, or rejects the diff. | Shows changed lines, causal evidence, expected effect, and affected tests. | Applies only the authorized patch; records the decision. | `patch-approved`, `patch-rejected`, or `patch-edited` |
| 18. Rerun | Starts the rerun, or allows autonomous mode to do so. | Shows the original run beside the new run when comparison is enabled. | Rebuilds, re-simulates, and evaluates the same acceptance criteria. | `rerunning` |
| 19. Confirm completion | Reviews the successful run and evidence. | Shows the corrected path, timing margin, tests passed, and comparison to the failed run. | Marks the task complete only when the acceptance criteria and simulator assertions pass. | `completed` |
| 20. Continue or publish | Continues development, saves a report, or performs a Git action. | Requires the relevant permission for commit/push/external side effects. | Persists the task history and keeps the final source/test diff auditable. | `continued`, `reported`, or `published` |

## UI element interaction sequence

This is the same journey expressed in terms of the interface elements the user touches. The names describe behavior and responsibility, not visual placement.

1. **Projects navigation item** — User opens the project list.
2. **New project button** — User starts project creation.
3. **Source selection control** — User chooses a new project, an existing repository, or a starter scaffold.
4. **Language selector** — User chooses C.
5. **Substrate selector** — User chooses Zephyr.
6. **Board selector** — User chooses STM32F4 Discovery.
7. **Project requirements field** — User describes the desired firmware behavior.
8. **Continue button** — System submits the request to the agent context.
9. **Clarification card** — If the request is ambiguous, the card states the missing decision, provides an answer field, and exposes **Answer**, **Edit interpretation**, and **Cancel task** actions.
10. **Agent workspace** — User sees the agent conversation, task status, file tree, source editor, and current task contract.
11. **Plan panel** — User reviews proposed files, tests, simulator assertions, expected hardware behavior, and estimated iterations.
12. **Permission profile selector** — User chooses review, guided, or autonomous operation. The selected profile is visible throughout the run.
13. **Start task button** — User authorizes the agent to begin the authoring loop.
14. **Test plan panel** — User reviews generated tests and acceptance criteria. A **Protect tests** control prevents silent weakening after approval.
15. **Source editor and change diff** — User reviews agent-authored firmware and project-file changes. The diff provides **Approve**, **Reject**, and **Request changes** actions when required by the permission profile.
16. **Build and simulation button** — User starts the compute job, or autonomous mode starts it automatically.
17. **Run status strip** — Shows the current stage: preparing, building, simulating, collecting trace, analyzing, or waiting.
18. **Console output tabs** — User switches between compiler output, Renode monitor output, UART output, test runner output, and trace-collection output.
19. **Build error panel** — On compilation failure, shows the error location, log excerpt, and **Ask agent to fix** / **Stop task** actions.
20. **Test result panel** — Shows passed and failed assertions, expected behavior, observed behavior, and whether a valid trace exists.
21. **Failure analysis view** — User opens it from **Open failure analysis** or a failed run row.
22. **Trace filter rail** — User filters assertions, components, functions, interrupts, peripherals, and severity.
23. **Timeline tab** — User selects an event marker or moves the time cursor.
24. **Virtual board tab** — User selects a timer, interrupt controller, CPU, GPIO, or LED to inspect its state at the selected time.
25. **Causal graph tab** — User selects a node to inspect the chain from observed event to derived effect to violated assertion.
26. **Event inspector** — Displays timestamp, source, register, value, taxonomy, and raw evidence for the selected event.
27. **Evidence panel** — Displays the deterministic root-cause explanation and links back to the relevant event markers.
28. **View source button** — Opens the source editor at the implicated line.
29. **Compare passing run button** — Opens the synchronized run-comparison view.
30. **Generate patch button** — Requests a patch proposal from the causal chain.
31. **Patch review view** — Shows the proposed diff, agent reasoning, expected effect, affected tests, risk level, and evidence references.
32. **Patch action bar** — Provides **Reject**, **Edit patch**, and **Approve and rerun** actions.
33. **Rerun confirmation dialog** — Summarizes files changed, tests to rerun, estimated cost/time, and comparison retention before execution.
34. **Rerun progress view** — Reuses the run status strip and console output tabs for the new run.
35. **Success result view** — Shows test summary, corrected execution path, timing margin, and the changed event compared with the failed run.
36. **Run comparison button** — Opens synchronized failed-versus-passing timelines, board state, source lines, and first-divergence marker.
37. **Save report button** — Persists an evidence report containing the task contract, runs, causal chain, diff, and final result.
38. **Continue development button** — Returns to the agent workspace with the successful source state as the new baseline.
39. **Commit/publish controls** — Performs Git actions only after their separate permission check.

### Persistent controls

These controls remain available across the journey:

- **Stop task button** — Cancels the active agent or compute job.
- **Take over button** — Pauses autonomous actions and returns control to the user.
- **Current permission profile indicator** — Makes the autonomy level explicit.
- **Iteration counter and budget indicator** — Shows attempts, elapsed time, and remaining job/cost budget.
- **Activity log** — Records every agent action, permission decision, source diff, build, simulation, and rerun.

## Clarification branch

The agent must pause when it cannot determine expected behavior, target constraints, or a required board capability.

1. Agent states the ambiguity in plain language.
2. Agent explains why guessing could produce incorrect firmware or tests.
3. User answers, edits the proposed interpretation, or cancels.
4. Agent resumes from the plan; it does not restart the entire task or silently choose a behavior.

Examples that require clarification:

- “Make the LED respond quickly” without a timing bound.
- “Support the board” without identifying which board revision or peripheral.
- A request that conflicts with the selected board’s available pins.

## Permission profiles

Permission is per action, not one global trust switch.

| Action | Review mode | Guided mode | Autonomous mode |
|---|---|---|---|
| Read project files | Allowed | Allowed | Allowed |
| Create a plan | Ask/approve | Allowed | Allowed |
| Write source/tests | Ask each change | Ask at checkpoints | Allowed inside the isolated task workspace |
| Build firmware | Ask | Allowed | Allowed |
| Run Renode | Ask | Allowed | Allowed inside the compute plane |
| Apply patch | Ask | Ask at patch checkpoint | Allowed only if pre-authorized |
| Modify tests | Ask | Ask | Never silently; requires explicit policy |
| Commit/push/deploy | Ask | Ask | Separate permission; never implied by autonomous coding |

Autonomous mode must still have a visible stop control, job/time/cost limits, iteration history, and a final summary of changes.

## Agent loop behavior

The loop is bounded and stateful rather than an unbounded `while` loop:

1. Read current task contract and repository state.
2. Choose the smallest next action.
3. Request permission for that action.
4. Execute it in the correct plane.
5. Capture the result, diff, logs, and cost.
6. Decide whether the result is success, a fixable failure, an ambiguity, or a blocker.
7. Stop on success, clarification, budget exhaustion, repeated no-progress failures, or user interruption.

The agent must never claim completion merely because the code compiled. Completion requires the approved behavior to be observed in simulation and the relevant tests to pass.

## Failure and recovery paths

### Build failure

The user sees the compiler output and the affected source location. The agent may propose a correction and retry. The trace-analysis view is unavailable because no valid run occurred.

### Simulation timeout or infrastructure failure

The user sees the distinction between firmware failure and compute-plane failure. The agent may retry within the budget, but it must not classify an infrastructure timeout as a firmware root cause.

### Empty or incomplete trace

The run is marked inconclusive. The agent requests a better trace or reports unsupported instrumentation; it does not fabricate causal nodes.

### Assertion failure with supported divergence

The causal engine identifies the observed divergence, displays the evidence chain, and offers an evidence-backed patch.

### Assertion failure with missing write

The engine follows the expected path and attributes the root cause to the last event that occurred before the expected write. This is a distinct path from divergence and must not be represented as a wrong register write.

### No progress

If repeated iterations produce the same failure, the agent stops and summarizes the attempted changes, evidence, and the question that needs human judgment.

## Completion contract

A task is complete only when all of these are true:

- the project builds for the selected board;
- the simulator run completes without infrastructure failure;
- the approved tests pass;
- the expected hardware behavior is observed in the trace;
- the final diff is available for inspection;
- the user has been told what changed and why.
