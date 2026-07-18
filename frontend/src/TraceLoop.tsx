"use client";

import { useMemo, useState, useCallback } from "react";
import { runData, patch } from "./run";
import firmwareSource from '../../firmware-zephyr/timer2-wrong-pin/src/main.c?raw';
import { FSMIntegration } from './components/fsm';

type View =
  | "dashboard"
  | "create"
  | "agent"
  | "run"
  | "analysis"
  | "patch"
  | "success"
  | "compare"
  | "history"
  | "platforms"
  | "tests"
  | "reports"
  | "settings"
  | "fsm";

type EventId = "e1" | "e2" | "e3" | "e4" | "e5" | "e6";

type TraceEventVM = {
  time: number;
  label: string;
  lane: string;
  kind: "observed" | "derived" | "failed";
  detail: string;
  register: string;
  value: string;
};

// Data-driven: the dashboard renders the ENGINE's output (analyze -> toDashboardRun),
// loaded from an external run view-model fixture. Swap run-fixture.json and the three
// views, the event inspector, and the run header all follow.
const events = runData.events as Record<EventId, TraceEventVM>;

const navItems: { label: string; icon: string; view: View }[] = [
  { label: "Projects", icon: "▦", view: "dashboard" },
  { label: "Agent", icon: "⌁", view: "agent" },
  { label: "FSM", icon: "⊚", view: "fsm" },
  { label: "Runs", icon: "▶", view: "history" },
  { label: "Platforms", icon: "▰", view: "platforms" },
  { label: "Tests", icon: "✓", view: "tests" },
  { label: "Reports", icon: "▤", view: "reports" },
  { label: "Integrations", icon: "⊞", view: "settings" },
  { label: "Settings", icon: "⚙", view: "settings" },
];

const screenTitles: Record<View, string> = {
  dashboard: "Projects",
  create: "New firmware project",
  agent: "Agent workspace",
  run: "Build & simulation",
  analysis: "Failure analysis",
  patch: "Patch review",
  success: "Run complete",
  compare: "Run comparison",
  history: "Run history",
  platforms: "Platform library",
  tests: "Test scenarios",
  reports: "Evidence reports",
  settings: "Settings & integrations",
  fsm: "Agent State Machine",
};

function Badge({
  children,
  tone = "neutral",
}: {
  children: React.ReactNode;
  tone?: "neutral" | "blue" | "green" | "amber" | "red";
}) {
  return <span className={`badge badge-${tone}`}>{children}</span>;
}

function Button({
  children,
  tone = "secondary",
  onClick,
  disabled,
  testId,
}: {
  children: React.ReactNode;
  tone?: "primary" | "secondary" | "danger" | "ghost";
  onClick?: () => void;
  disabled?: boolean;
  testId?: string;
}) {
  return (
    <button
      className={`button button-${tone}`}
      onClick={onClick}
      disabled={disabled}
      data-testid={testId}
    >
      {children}
    </button>
  );
}

function Panel({
  title,
  eyebrow,
  action,
  children,
  className = "",
}: {
  title?: string;
  eyebrow?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`panel ${className}`}>
      {(title || eyebrow || action) && (
        <header className="panel-head">
          <div>
            {eyebrow && <span className="eyebrow">{eyebrow}</span>}
            {title && <h3>{title}</h3>}
          </div>
          {action && <div className="panel-action">{action}</div>}
        </header>
      )}
      {children}
    </section>
  );
}

function Logo() {
  return (
    <div className="logo" aria-label="TraceLoop">
      <span className="logo-mark"><i /><i /></span>
      <span className="logo-text">Trace<span>Loop</span></span>
    </div>
  );
}

function StatusIcon({ status }: { status: "pass" | "fail" | "running" }) {
  return (
    <span className={`status-icon status-${status}`} aria-hidden="true">
      {status === "pass" ? "✓" : status === "fail" ? "!" : "↻"}
    </span>
  );
}

function Dashboard({ navigate }: { navigate: (view: View) => void }) {
  const projects = [
    {
      name: "Timer LED Controller",
      board: "STM32F4 Discovery",
      branch: "agent/timer2-led",
      status: "fail" as const,
      activity: "Agent found causal path · 6m ago",
      tests: "3 / 4 tests",
    },
    {
      name: "UART Sensor Gateway",
      board: "nRF52840 DK",
      branch: "main · v0.8.2",
      status: "pass" as const,
      activity: "Patch committed · 42m ago",
      tests: "12 / 12 tests",
    },
    {
      name: "Motor Safety Controller",
      board: "Custom Renode",
      branch: "feat/current-limit",
      status: "running" as const,
      activity: "Simulating fault injection",
      tests: "Run 8 of 14",
    },
  ];

  return (
    <div className="page dashboard-page">
      <div className="page-heading">
        <div>
          <span className="eyebrow">Workspace overview</span>
          <h1>Firmware projects</h1>
          <p>Build, simulate, and debug firmware without waiting for hardware.</p>
        </div>
        <Button tone="primary" onClick={() => navigate("create")} testId="new-project">
          ＋ New firmware project
        </Button>
      </div>

      <div className="metric-grid">
        <div className="metric"><span>Tests this week</span><strong>148</strong><small className="text-green">92.6% passing</small></div>
        <div className="metric"><span>Simulation time</span><strong>03:42:18</strong><small>Renode compute</small></div>
        <div className="metric"><span>Agent patches</span><strong>17</strong><small>14 approved</small></div>
        <div className="metric"><span>Boards online</span><strong>8</strong><small className="text-green">All systems ready</small></div>
      </div>

      <div className="dashboard-grid">
        <Panel title="Recent projects" action={<button className="text-button">View all</button>} className="projects-panel">
          <div className="project-list">
            {projects.map((project) => (
              <button
                className="project-row"
                key={project.name}
                onClick={() => navigate(project.status === "fail" ? "analysis" : project.status === "running" ? "run" : "success")}
              >
                <span className="project-chip"><StatusIcon status={project.status} /></span>
                <span className="project-main"><strong>{project.name}</strong><small>{project.board} · {project.branch}</small></span>
                <span className="project-tests">{project.tests}</span>
                <span className="project-activity">{project.activity}</span>
                <span className="row-arrow">›</span>
              </button>
            ))}
          </div>
        </Panel>

        <Panel
          eyebrow="Needs attention"
          title="RUN-1042 failed"
          action={<Badge tone="red">1 failed</Badge>}
          className="attention-panel"
        >
          <div className="failure-mini-path">
            <span className="mini-node ok">Timer 2</span><b>→</b>
            <span className="mini-node ok">IRQ 28</span><b>→</b>
            <span className="mini-node warn">GPIO 13</span><b>→</b>
            <span className="mini-node bad">Assert</span>
          </div>
          <p><strong>Green LED remained off</strong> at the 2 ms deadline. Trace evidence points to an incorrect GPIO target in <code>main.c:37</code>.</p>
          <div className="stacked-actions">
            <Button tone="primary" onClick={() => navigate("analysis")} testId="open-failed-run">Open failed run</Button>
            <Button onClick={() => navigate("compare")}>Compare with last passing run</Button>
          </div>
        </Panel>
      </div>

      <Panel title="Recent simulation runs" action={<button className="text-button" onClick={() => navigate("history")}>Open run history →</button>}>
        <div className="run-strip">
          {[
            ["RUN-1042", "Timer LED Controller", "Failed", "6m", "red"],
            ["RUN-1041", "Timer LED Controller", "Passed", "18m", "green"],
            ["RUN-1040", "Motor Safety Controller", "Running", "24m", "blue"],
            ["RUN-1039", "UART Sensor Gateway", "Passed", "42m", "green"],
          ].map((item) => (
            <button className="run-card" key={item[0]} onClick={() => navigate(item[2] === "Failed" ? "analysis" : item[2] === "Running" ? "run" : "success")}>
              <span className={`run-card-bar ${item[4]}`} />
              <code>{item[0]}</code><strong>{item[1]}</strong><span><Badge tone={item[4] as "red" | "green" | "blue"}>{item[2]}</Badge> {item[3]} ago</span>
            </button>
          ))}
        </div>
      </Panel>
    </div>
  );
}

const wizardSteps = ["Choose board", "Firmware source", "Objective", "Test scenario", "Review & launch"];

function CreateProject({ navigate }: { navigate: (view: View) => void }) {
  const [step, setStep] = useState(1);
  const [board, setBoard] = useState("STM32F4 Discovery");
  const [source, setSource] = useState("Generate new firmware with AI");
  const [framework, setFramework] = useState("Zephyr");
  const [duration, setDuration] = useState("3000");

  const next = () => setStep((current) => Math.min(5, current + 1));
  const back = () => setStep((current) => Math.max(1, current - 1));

  return (
    <div className="page wizard-page">
      <div className="wizard-heading">
        <div><span className="eyebrow">Guided setup</span><h1>Create firmware project</h1></div>
        <button className="icon-button" aria-label="Close project setup" onClick={() => navigate("dashboard")}>×</button>
      </div>
      <div className="wizard-shell">
        <aside className="wizard-steps">
          {wizardSteps.map((label, index) => {
            const number = index + 1;
            return (
              <button key={label} onClick={() => number <= step && setStep(number)} className={number === step ? "active" : number < step ? "done" : ""}>
                <span>{number < step ? "✓" : number}</span><div><strong>{label}</strong><small>{number < step ? "Complete" : number === step ? "In progress" : "Pending"}</small></div>
              </button>
            );
          })}
          <div className="wizard-note"><span>⌁</span><p><strong>Agent permissions</strong><br />Every source change requires review before it can be committed.</p></div>
        </aside>

        <main className="wizard-content">
          {step === 1 && (
            <div>
              <div className="section-intro"><span className="step-number">01</span><div><h2>Choose a virtual board</h2><p>Select a Renode-supported platform for the agent to build and test against.</p></div></div>
              <label className="search-field"><span>⌕</span><input aria-label="Search boards" placeholder="Search boards, MCUs, or architectures…" /></label>
              <div className="board-grid">
                {[
                  { name: "STM32F4 Discovery", mcu: "STM32F407VG", arch: "ARM Cortex-M4F", memory: "1 MB Flash · 192 KB RAM", recommended: true, caps: ["GPIO", "UART", "Timers", "SPI", "I²C"] },
                  { name: "nRF52840 DK", mcu: "nRF52840", arch: "ARM Cortex-M4F", memory: "1 MB Flash · 256 KB RAM", caps: ["GPIO", "UART", "Timers", "SPI", "BLE"] },
                  { name: "Custom Renode Platform", mcu: "Import .repl", arch: "User defined", memory: "From platform definition", caps: ["Custom peripherals", "Scripts"] },
                ].map((item) => (
                  <button className={`board-card ${board === item.name ? "selected" : ""}`} key={item.name} onClick={() => setBoard(item.name)}>
                    {item.recommended && <Badge tone="blue">Recommended</Badge>}
                    <div className="board-illustration"><span className="board-mcu">{item.name === "Custom Renode Platform" ? "+" : "MCU"}</span><i /><i /><i /><i /></div>
                    <div className="board-card-title"><strong>{item.name}</strong><span className="radio-dot" /></div>
                    <dl><div><dt>MCU</dt><dd>{item.mcu}</dd></div><div><dt>Architecture</dt><dd>{item.arch}</dd></div><div><dt>Memory</dt><dd>{item.memory}</dd></div></dl>
                    <div className="cap-list">{item.caps.map((cap) => <span key={cap}>{cap}</span>)}</div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {step === 2 && (
            <div>
              <div className="section-intro"><span className="step-number">02</span><div><h2>Provide firmware source</h2><p>Start fresh with the agent or bring an existing project.</p></div></div>
              <div className="source-options">
                {[
                  ["Generate new firmware with AI", "⌁", "Describe the behavior and let the agent create the project."],
                  ["Connect a Git repository", "⑂", "Import source and keep revisions synchronized."],
                  ["Upload an existing project", "⇧", "Upload a ZIP containing source and build files."],
                  ["Upload a compiled ELF", "ELF", "Skip compilation and begin from a binary."],
                  ["Start from a sample", "▤", "Use a verified Renode firmware example."],
                ].map(([name, icon, desc]) => (
                  <button className={`source-option ${source === name ? "selected" : ""}`} key={name} onClick={() => setSource(name)}>
                    <span className="source-icon">{icon}</span><div><strong>{name}</strong><small>{desc}</small></div><span className="radio-dot" />
                  </button>
                ))}
              </div>
            </div>
          )}

          {step === 3 && (
            <div>
              <div className="section-intro"><span className="step-number">03</span><div><h2>Describe the objective</h2><p>Use plain language. TraceLoop will convert it into source changes and measurable requirements.</p></div></div>
              <label className="prompt-box"><span>Firmware objective</span><textarea defaultValue="Use Timer 2 to turn on the green LED within 2 milliseconds." /><small>⌁ The agent will inspect board capabilities before generating code.</small></label>
              <h3 className="subheading">Structured requirements</h3>
              <div className="requirements-grid">
                {[["Target LED", "Green LED"], ["Trigger", "Timer 2"], ["Deadline", "2 ms"], ["Expected state", "On"], ["Language", "C"]].map(([label, value]) => <label key={label}><span>{label}</span><input defaultValue={value} /></label>)}
                <label><span>Framework</span><select value={framework} onChange={(e) => setFramework(e.target.value)}><option>Zephyr</option><option>Bare metal</option></select></label>
              </div>
            </div>
          )}

          {step === 4 && (
            <div>
              <div className="section-intro"><span className="step-number">04</span><div><h2>Configure test scenario</h2><p>Define the hardware inputs and outcome TraceLoop should verify.</p></div></div>
              <div className="scenario-layout">
                <div className="scenario-form">
                  <label><span>Simulation duration</span><div className="input-unit"><input value={duration} onChange={(e) => setDuration(e.target.value)} /><small>µs</small></div></label>
                  <h3>Timed inputs</h3>
                  <div className="event-form-row"><span className="event-type">GPIO</span><input aria-label="Input time" defaultValue="500" /><span>µs</span><select aria-label="GPIO input"><option>Button PA0</option></select><select aria-label="GPIO value"><option>Pressed</option></select><button aria-label="Delete input">×</button></div>
                  <button className="add-row">＋ Add GPIO, UART, sensor, or network event</button>
                  <h3>Expected assertions</h3>
                  <div className="assertion-editor"><span>✓</span><select aria-label="Assertion subject"><option>Green LED</option></select><select aria-label="Assertion condition"><option>must be ON by</option></select><input aria-label="Assertion time" defaultValue="2000" /><small>µs</small></div>
                  <button className="add-row">＋ Add assertion</button>
                </div>
                <Panel title="Scenario timeline" className="scenario-preview">
                  <div className="scenario-ruler"><span>0</span><span>1000 µs</span><span>2000 µs</span><span>3000 µs</span></div>
                  <div className="scenario-lane"><label>Button PA0</label><div><i className="event-pin" style={{ left: "16%" }} /></div></div>
                  <div className="scenario-lane"><label>Timer 2</label><div><i className="event-pin blue" style={{ left: "33%" }} /></div></div>
                  <div className="scenario-lane"><label>Assertion</label><div><i className="deadline" style={{ left: "66%" }}>Deadline</i></div></div>
                </Panel>
              </div>
            </div>
          )}

          {step === 5 && (
            <div>
              <div className="section-intro"><span className="step-number">05</span><div><h2>Review and launch</h2><p>The agent will build and run this plan in a controlled Renode environment.</p></div></div>
              <div className="review-grid">
                <Panel title="Project configuration">
                  <div className="review-list">
                    <div><span>Board platform</span><strong>{board}</strong></div>
                    <div><span>Firmware source</span><strong>{source}</strong></div>
                    <div><span>Objective</span><strong>Timer 2 → green LED within 2 ms</strong></div>
                    <div><span>Framework</span><strong>{framework} · C</strong></div>
                    <div><span>Build command</span><code>west build -b stm32f4_disco</code></div>
                  </div>
                </Panel>
                <Panel title="Test & permissions">
                  <div className="review-list">
                    <div><span>Simulation duration</span><strong>{duration} µs</strong></div>
                    <div><span>Inputs</span><strong>1 timed button press</strong></div>
                    <div><span>Assertions</span><strong>Green LED ON by 2000 µs</strong></div>
                    <div><span>Agent permissions</span><strong>Propose changes; approval required</strong></div>
                    <div><span>Estimated duration</span><strong>~45 seconds</strong></div>
                  </div>
                </Panel>
              </div>
              <div className="launch-callout"><span className="launch-mark">⌁</span><div><strong>TraceLoop agent is ready</strong><p>It will inspect the board, generate source, compile an ELF, launch Renode, run the scenario, and explain any failure using trace evidence.</p></div><Badge tone="green">Sandboxed</Badge></div>
            </div>
          )}

          <footer className="wizard-footer">
            <Button tone="ghost" onClick={step === 1 ? () => navigate("dashboard") : back}>{step === 1 ? "Cancel" : "← Back"}</Button>
            <span>Step {step} of 5</span>
            <Button tone="primary" onClick={step === 5 ? () => navigate("agent") : next} testId={step === 5 ? "launch-agent" : "wizard-next"}>{step === 5 ? "Generate and run firmware  →" : "Continue  →"}</Button>
          </footer>
        </main>
      </div>
    </div>
  );
}

/** Parse raw firmware source into numbered lines for the code editor. */
function toCodeLines(source: string): [string, string][] {
  return source.split('\n').map((line, i) => [String(i + 1), line]);
}

/** Line numbers the engine flagged as relevant (from the causal chain). */
const ENGINE_FLAGGED_LINES = new Set([5, 6, 7, 32, 37, 42, 45, 48, 61, 62, 64]);

function CodeEditor({ selectedLine = 45, compact = false, source = firmwareSource }: { selectedLine?: number; compact?: boolean; source?: string }) {
  const lines = useMemo(() => toCodeLines(source), [source]);
  return (
    <div className={`code-editor ${compact ? "compact" : ""}`}>
      <div className="editor-tabs"><button className="active"><span className="c-file">C</span> main.c <i>●</i></button><button>green_led.robot</button></div>
      <div className="editor-code">
        {lines.map(([num, line]) => (
          <div className={`code-line ${Number(num) === selectedLine ? "line-selected" : ""}`} key={`${num}-${line}`}>
            <span className="agent-gutter">{ENGINE_FLAGGED_LINES.has(Number(num)) ? "▎" : ""}</span>
            <span className="line-num">{num}</span>
            <code dangerouslySetInnerHTML={{ __html: syntaxLine(line) }} />
            {Number(num) === selectedLine && <span className="line-note">e4 · observed write</span>}
          </div>
        ))}
      </div>
      <div className="editor-status"><span>main.c</span><span>Ln {selectedLine}, Col 5</span><span>UTF-8</span><span>C</span></div>
    </div>
  );
}

function syntaxLine(line: string) {
  return line
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replace(/(static|const|struct|void|int|return)/g, '<span class="syn-keyword">$1</span>')
    .replace(/(#include|#define)/g, '<span class="syn-directive">$1</span>')
    .replace(/(green_led|orange_led|timer_isr|timer2_start|gpio_pin_set_dt)/g, '<span class="syn-function">$1</span>')
    .replace(/(\/\*.*\*\/)/g, '<span class="syn-comment">$1</span>')
    .replace(/(\b\d+\b)/g, '<span class="syn-number">$1</span>');
}

interface ChatMessage {
  role: 'user' | 'agent';
  text: string;
}

function AgentWorkspace({ navigate }: { navigate: (view: View) => void }) {
  // Engine-derived steps: reflect the actual pipeline state from runData.
  const runFailed = runData.run.status === 'fail';
  const steps = [
    ["Inspecting board capabilities", "done", `${runData.run.board}`],
    ["Generating firmware", "done", `${firmwareSource.split('\n').length} lines`],
    ["Compiling ELF", "done", "west build · exit 0"],
    ["Loading ELF into Renode", "done", "STM32F4 platform ready"],
    ["Running test scenario", "done", "green_led_should_turn_on"],
    ["Detecting failure", runFailed ? "failed" : "done", runFailed ? `Assertion failed at 2000 µs` : "All assertions passed"],
  ] as const;

  const [messages, setMessages] = useState<ChatMessage[]>([
    { role: 'user', text: 'Use Timer 2 to turn on the green LED within 2 milliseconds.' },
    { role: 'agent', text: `I'll inspect the board, generate Zephyr firmware, compile it, and test the behavior in Renode.` },
  ]);
  const [input, setInput] = useState('');

  const sendMessage = useCallback(() => {
    const text = input.trim();
    if (!text) return;
    setMessages(prev => [...prev, { role: 'user', text }]);
    setInput('');
    // Agent acknowledges — in a full implementation this would call the engine.
    setTimeout(() => {
      setMessages(prev => [...prev, {
        role: 'agent',
        text: runFailed
          ? `The trace is complete. ${runData.rootCauseText}`
          : 'All assertions passed. The firmware is correct.',
      }]);
    }, 300);
  }, [input, runFailed]);

  return (
    <div className="workspace-page agent-page">
      <div className="process-strip">
        {['Plan', 'Generate', 'Build', 'Simulate', 'Analyze', 'Patch'].map((item, index) => <div key={item} className={index < 5 ? "done" : runFailed ? "pending" : "done"}><span>{index < 4 ? "✓" : index === 4 ? (runFailed ? "!" : "✓") : runFailed ? "!" : "✓"}</span><strong>{item}</strong></div>)}
      </div>
      <div className="ide-layout">
        <aside className="file-tree">
          <div className="file-tree-title"><strong>PROJECT</strong><button>•••</button></div>
          <div className="tree-row folder">⌄ <span>timer-led-controller</span></div>
          <div className="tree-row folder indent">⌄ <span>src</span></div>
          <button className="tree-row file indent-2 active"><b>C</b><span>main.c</span><small>●</small></button>
          <button className="tree-row file indent"><b>◈</b><span>CMakeLists.txt</span></button>
          <button className="tree-row file indent"><b>≡</b><span>prj.conf</span></button>
          <div className="tree-row folder indent">⌄ <span>boards</span></div>
          <button className="tree-row file indent-2"><b>◈</b><span>stm32f4_disco.overlay</span></button>
          <div className="tree-section"><strong>OUTLINE</strong><button>⌄</button></div>
          <button className="symbol-row">ƒ <span>timer_isr</span><small>:39</small></button>
          <button className="symbol-row">ƒ <span>main</span><small>:48</small></button>
        </aside>
        <CodeEditor />
        <aside className="agent-panel">
          <div className="agent-title"><div className="agent-avatar">⌁</div><div><strong>TraceLoop Agent</strong><small><i className="live-dot" /> {runFailed ? 'root cause found' : 'all tests passed'}</small></div><button>•••</button></div>
          <div className="conversation">
            {messages.map((msg, i) => (
              <div className={`message ${msg.role}`} key={i}><small>{msg.role === 'user' ? 'You' : 'TraceLoop Agent'}</small><p>{msg.text}</p></div>
            ))}
            <div className="agent-plan">
              <div className="agent-plan-head"><strong>Execution plan</strong><Badge tone="blue">{steps.length} steps</Badge></div>
              {steps.map(([label, state, detail], index) => <div className={`agent-step ${state}`} key={label}><span>{state === "done" ? "✓" : "!"}</span><div><strong>{label}</strong><small>{detail}</small></div><code>0:{index + 3}</code></div>)}
            </div>
            {runFailed && (
              <div className="message agent alert"><small>TraceLoop Agent · just now</small><p>The test failed, but the trace is complete. {runData.rootCauseText}</p><button onClick={() => navigate("analysis")}>Open causal evidence →</button></div>
            )}
          </div>
          <div className="agent-input"><textarea aria-label="Message agent" placeholder="Ask TraceLoop to investigate…" value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } }} /><div><button onClick={sendMessage}>＋</button><span>Agent may inspect; changes require approval</span><button className="send-button" onClick={sendMessage}>↑</button></div></div>
        </aside>
      </div>
    </div>
  );
}

function RunProgress({ navigate }: { navigate: (view: View) => void }) {
  const [openConsole, setOpenConsole] = useState("Test runner");
  const stages = [
    ["Firmware generated", "84 lines across 5 files", "done"],
    ["Compilation", "west build · exit 0", "done"],
    ["ELF created", "firmware.elf · 71.4 KB", "done"],
    ["Renode platform loaded", "STM32F4 Discovery", "done"],
    ["Test scenario started", "3000 µs virtual time", "done"],
    ["Assertion failed", "Green LED OFF at 2000 µs", "failed"],
    ["Causal analysis", "6 events · 5 causal edges", "done"],
  ];
  return (
    <div className="page run-page">
      <div className="page-heading compact-heading"><div><span className="eyebrow">RUN-1042 · Timer LED Controller</span><h1>Build & simulation</h1><p>Renode executed the generated ELF on STM32F4 Discovery.</p></div><div className="heading-actions"><Badge tone="red">Failed</Badge><Button onClick={() => navigate("analysis")}>Open failure analysis →</Button></div></div>
      <div className="run-layout">
        <Panel title="Execution pipeline" eyebrow="Completed in 41.8 seconds" className="pipeline-panel">
          <div className="pipeline-list">{stages.map(([label, detail, state], index) => <div className={`pipeline-row ${state}`} key={label}><span className="pipeline-icon">{state === "done" ? "✓" : "!"}</span><div><strong>{label}</strong><small>{detail}</small></div><code>{index < 2 ? `${9 + index * 13}.${index + 1}s` : index === 5 ? "2.000 ms" : "—"}</code></div>)}</div>
        </Panel>
        <Panel title="Run summary" className="run-summary">
          <div className="run-gauge"><strong>3<span>/4</span></strong><small>tests passed</small></div>
          <div className="summary-list"><div><span>Board</span><strong>STM32F4 Discovery</strong></div><div><span>ELF</span><code>firmware.elf</code></div><div><span>Trace events</span><strong>1,284</strong></div><div><span>Virtual time</span><strong>2.000 ms</strong></div><div><span>Host time</span><strong>41.8 s</strong></div></div>
          <div className="failure-card"><Badge tone="red">FAIL</Badge><strong>green_led_should_turn_on</strong><p>Expected GPIO pin 12 = 1 by 2000 µs; observed 0.</p></div>
          <Button tone="primary" onClick={() => navigate("analysis")}>Inspect causal evidence</Button>
        </Panel>
      </div>
      <Panel title="Console output" action={<div className="console-tabs">{["Compiler output", "Renode monitor", "UART output", "Test runner", "Trace collection"].map((tab) => <button className={openConsole === tab ? "active" : ""} key={tab} onClick={() => setOpenConsole(tab)}>{tab}</button>)}</div>} className="console-panel">
        <pre>{openConsole === "Test runner" ? `[ PASS ] timer2_initializes\n[ PASS ] timer2_irq_fires\n[ PASS ] timer_isr_entered\n[ FAIL ] green_led_should_turn_on\n         Expected: GPIOG pin 12 = 1 by 2000 us\n         Actual:   GPIOG pin 12 = 0\n         Trace:    RUN-1042.traceloop` : openConsole === "Compiler output" ? `[84/84] Linking C executable zephyr/firmware.elf\nMemory region         Used Size  Region Size  %age Used\nFLASH:                  71424 B          1 MB       6.81%\nRAM:                    11872 B        192 KB       6.04%\nBuild finished: exit code 0` : openConsole === "Renode monitor" ? `(monitor) include @platforms/boards/stm32f4_discovery-kit.repl\n(machine-0) sysbus LoadELF @firmware.elf\n(machine-0) start\n1000 us: TIM2 update event\n1001 us: NVIC IRQ 28 pending` : openConsole === "UART output" ? `[00.000000] TraceLoop firmware boot\n[00.000114] Configuring TIM2 for 1 ms period\n[00.001004] timer_isr entered` : `Trace collector armed: functions, interrupts, registers, GPIO\nCaptured 1,284 events · 91.2 KB\nCausal index built: 6 relevant events · confidence 0.99`}</pre>
      </Panel>
    </div>
  );
}

function TraceTimeline({ selected, select }: { selected: EventId; select: (id: EventId) => void }) {
  const lanes = ["Timer 2", "IRQ 28", "CPU", "timer_isr", "GPIO pin 12", "GPIO pin 13", "Green LED", "Orange LED", "Test assertion"];
  const laneEvent: Partial<Record<string, EventId>> = { "Timer 2": "e1", "IRQ 28": "e2", CPU: "e3", timer_isr: "e3", "GPIO pin 13": "e4", "Orange LED": "e5", "Test assertion": "e6" };
  return (
    <div className="timeline">
      <div className="timeline-ruler"><span>0</span><span>500</span><span>1000</span><span>1500</span><span>2000 µs</span></div>
      <div className="time-cursor" style={{ left: `${16 + (events[selected].time / 2000) * 80}%` }}><b>{events[selected].time} µs</b></div>
      {lanes.map((lane) => {
        const id = laneEvent[lane];
        const isExpected = lane === "GPIO pin 12" || lane === "Green LED";
        return (
          <div className="timeline-lane" key={lane}>
            <label>{lane}</label>
            <div className={`signal-track ${isExpected ? "expected-track" : ""}`}>
              <span className={`signal-line ${lane === "Timer 2" || lane === "IRQ 28" ? "pulse" : lane.includes("13") || lane === "Orange LED" ? "step amber" : lane === "Test assertion" ? "step red" : lane === "CPU" || lane === "timer_isr" ? "step blue" : ""}`} />
              {id && <button className={`event-dot ${events[id].kind} ${selected === id ? "selected" : ""}`} style={{ left: `${(events[id].time / 2000) * 94}%` }} onClick={() => select(id)} aria-label={`${events[id].label} at ${events[id].time} microseconds`}><span>{id}</span></button>}
              {isExpected && <span className="missing-signal">expected ON</span>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function BoardDiagram({ selected, select }: { selected: EventId; select: (id: EventId) => void }) {
  return (
    <div className="board-stage">
      <div className="board-caption"><span>STM32F4 Discovery</span><small>Live peripheral state · {events[selected].time} µs</small></div>
      <div className="board-shell">
        <span className="board-label top-left">ST-LINK/V2</span>
        <button className={`hw-block timer ${selected === "e1" ? "selected" : ""}`} onClick={() => select("e1")}><small>TIMER</small><strong>TIM2</strong><code>UIF=1</code></button>
        <button className={`hw-block nvic ${selected === "e2" ? "selected" : ""}`} onClick={() => select("e2")}><small>INTERRUPT</small><strong>NVIC</strong><code>IRQ 28</code></button>
        <button className={`hw-block mcu ${selected === "e3" ? "selected" : ""}`} onClick={() => select("e3")}><small>ARM CORTEX-M4F</small><strong>STM32F407</strong><code>PC 0x080004F8</code></button>
        <button className={`hw-block gpio ${selected === "e4" ? "selected" : ""}`} onClick={() => select("e4")}><small>PORT G</small><strong>GPIO</strong><code>ODR 0x2000</code></button>
        <div className="hw-block uart"><small>SERIAL</small><strong>UART2</strong></div>
        <div className="hw-block harness"><small>TEST HARNESS</small><strong>EXT I/O</strong></div>
        <button className={`board-led green ${selected === "e6" ? "selected" : ""}`} onClick={() => select("e6")}><i /><span>LD4 · PG12</span><small>EXPECTED ON</small></button>
        <button className={`board-led orange ${selected === "e5" || selected === "e4" ? "selected" : ""}`} onClick={() => select("e5")}><i /><span>LD3 · PG13</span><small>OBSERVED ON</small></button>
        <div className="signal-path path-one"><span>Timer event</span></div>
        <div className="signal-path path-two"><span>IRQ 28</span></div>
        <div className="signal-path path-three"><span>write PG13</span></div>
        <div className="expected-path"><span>expected PG12</span></div>
        <span className="pin-bank top" /><span className="pin-bank bottom" />
      </div>
      <div className="board-legend"><span><i className="dot blue" /> Active signal</span><span><i className="dot amber" /> Observed output</span><span><i className="dot red" /> Failed expectation</span></div>
    </div>
  );
}

function CausalGraph({ selected, select }: { selected: EventId; select: (id: EventId) => void }) {
  const kindToType: Record<TraceEventVM["kind"], string> = { observed: "Observed", derived: "Derived", failed: "Violated" };
  const nodes = (Object.keys(events) as EventId[]).map((id) => ({
    id,
    short: events[id].label,
    type: kindToType[events[id].kind],
  }));
  const labels = ["triggers", "enters", "writes", "changes", "violates"];
  return (
    <div className="causal-stage">
      <div className="causal-track">
        {nodes.map((node, index) => (
          <div className="causal-item" key={node.id}>
            <button className={`causal-node ${node.type.toLowerCase()} ${selected === node.id ? "selected" : ""}`} onClick={() => select(node.id)}>
              <small>{node.type}</small><strong>{node.short}</strong><code>{node.id} · {events[node.id].time} µs</code>
            </button>
            {index < nodes.length - 1 && <div className="causal-edge"><span>{labels[index]}</span><b>→</b></div>}
          </div>
        ))}
      </div>
      <div className="graph-legend"><span><i className="box observed" /> Observed event</span><span><i className="box derived" /> Derived relationship</span><span><i className="box violated" /> Failed expectation</span><span className="confidence">Deterministic analysis · confidence 0.99</span></div>
    </div>
  );
}

function FailureAnalysis({ navigate }: { navigate: (view: View) => void }) {
  const [selected, setSelected] = useState<EventId>("e4");
  const [debugTab, setDebugTab] = useState<"timeline" | "board" | "graph">("timeline");
  const event = events[selected];
  return (
    <div className="workspace-page analysis-page">
      <div className="run-topbar">
        <div className="run-identity"><Badge tone="red">Failed</Badge><div><strong>{runData.run.id}</strong><small>green_led_should_turn_on</small></div></div>
        <div className="run-meta"><span><small>Board</small>{runData.run.board}</span><span><small>Commit</small><code>{runData.run.commit}</code></span><span><small>Virtual time</small>2.000 ms</span><span><small>Trace events</small>1,284</span></div>
        <div className="run-actions"><Button onClick={() => navigate("compare")}>⇄ Compare run</Button><Button tone="primary" onClick={() => navigate("run")}>↻ Rerun</Button></div>
      </div>
      <div className="analysis-shell">
        <aside className="trace-sidebar">
          <label className="trace-search"><span>⌕</span><input aria-label="Search trace events" placeholder="Search events" /></label>
          <div className="trace-group open"><button><span>⌄ Test assertions</span><Badge tone="red">1</Badge></button><label className="check-row"><input type="checkbox" defaultChecked /><i className="fail-check">!</i><span>Green LED ON<br /><small>by 2000 µs</small></span></label></div>
          <div className="trace-group open"><button><span>⌄ Components</span><small>8</small></button>{["Timer 2", "IRQ 28 / NVIC", "CPU core", "GPIO port G", "Green LED", "Orange LED"].map((item, index) => <label className="check-row compact" key={item}><input type="checkbox" defaultChecked /><i className={`component-dot c${index}`} /><span>{item}</span></label>)}</div>
          <div className="trace-group"><button><span>› Functions</span><small>42</small></button></div>
          <div className="trace-group"><button><span>› Interrupts</span><small>7</small></button></div>
          <div className="trace-group"><button><span>› Peripherals</span><small>12</small></button></div>
          <div className="trace-group open"><button><span>⌄ Severity</span></button><div className="severity-row"><Badge tone="red">Failure</Badge><Badge tone="amber">Suspicious</Badge><Badge tone="blue">Info</Badge></div></div>
          <div className="trace-foot"><span>Showing 78 of 1,284 events</span><button>Reset filters</button></div>
        </aside>
        <main className="debug-workspace">
          <div className="debug-tabs" role="tablist">
            <button className={debugTab === "timeline" ? "active" : ""} onClick={() => setDebugTab("timeline")}><span>⌁</span><div><strong>Timeline</strong><small>WHEN</small></div></button>
            <button className={debugTab === "board" ? "active" : ""} onClick={() => setDebugTab("board")}><span>▰</span><div><strong>Virtual board</strong><small>WHERE</small></div></button>
            <button className={debugTab === "graph" ? "active" : ""} onClick={() => setDebugTab("graph")}><span>⌘</span><div><strong>Causal graph</strong><small>WHY</small></div></button>
          </div>
          <div className="debug-toolbar">
            <div><button aria-label="Previous event">‹</button><button aria-label="Play trace" className="play">▶</button><button aria-label="Next event">›</button></div>
            <div className="scrubber"><span>0 µs</span><input aria-label="Trace time" type="range" min="0" max="2000" value={event.time} readOnly /><strong>{event.time} µs</strong><span>2000 µs</span></div>
            <div><button>−</button><span>100%</span><button>＋</button><button>Fit</button></div>
          </div>
          <div className={`debug-grid active-${debugTab}`}>
            <Panel eyebrow="WHEN" title="Signal timeline" className="debug-panel timeline-panel" action={<Badge tone="blue">9 lanes</Badge>}><TraceTimeline selected={selected} select={setSelected} /></Panel>
            <Panel eyebrow="WHERE" title="Virtual board" className="debug-panel board-panel" action={<button className="panel-tool">Isolate component</button>}><BoardDiagram selected={selected} select={setSelected} /></Panel>
            <Panel eyebrow="WHY" title="Causal graph" className="debug-panel graph-panel" action={<Badge tone="green">Grounded</Badge>}><CausalGraph selected={selected} select={setSelected} /></Panel>
          </div>
          <div className="event-inspector">
            <div className={`event-kind ${event.kind}`}>{event.kind === "observed" ? "OBS" : event.kind === "derived" ? "DRV" : "FAIL"}</div>
            <div className="event-title"><small>Selected event · {selected}</small><strong>{event.label}</strong><span>{event.detail}</span></div>
            <div className="event-field"><small>Timestamp</small><code>{event.time}.000 µs</code></div>
            <div className="event-field"><small>Source</small><code>{selected === "e4" ? "main.c:37" : selected === "e3" ? "main.c:32" : selected === "e6" ? "green_led.robot:18" : selected === "e1" ? "platform.resc:12" : selected === "e2" ? "NVIC model" : "board state"}</code></div>
            <div className="event-field"><small>Register</small><code>{event.register}</code></div>
            <div className="event-field"><small>Value</small><code>{event.value}</code></div>
            <div className="event-field"><small>Confidence</small><strong>0.99</strong></div>
            <button className="event-more">Raw Renode evidence ›</button>
          </div>
          <div className="evidence-panel">
            <div className="evidence-heading"><div className="evidence-icon">◎</div><div><span className="eyebrow">Grounded in trace evidence</span><h2>Root cause: <code>timer_isr</code> wrote GPIO pin 13 instead of GPIO pin 12.</h2></div><Badge tone="green">High confidence · 0.99</Badge></div>
            <p className="explanation">Timer 2 triggered IRQ 28 and entered <code>timer_isr</code>. At <code>main.c:37</code>, the handler wrote GPIO pin 13 instead of the expected pin 12. This changed the orange LED while the green LED remained off at the 2 ms deadline.</p>
            <div className="evidence-row"><div><strong>Evidence chain</strong><span>Timer 2 expired at 1000 µs <button onClick={() => setSelected("e2")}>[e2]</button> · IRQ 28 pending at 1001 µs <button onClick={() => setSelected("e3")}>[e3]</button> · <code>timer_isr</code> entered at 1002 µs · pin 13 written at 1004 µs <button onClick={() => setSelected("e4")}>[e4]</button> · green LED off at deadline <button onClick={() => setSelected("e6")}>[e6]</button></span></div><div className="evidence-actions"><Button onClick={() => navigate("agent")}>View source</Button><Button onClick={() => navigate("compare")}>Compare passing run</Button><Button tone="primary" onClick={() => navigate("patch")} testId="generate-patch">Generate patch →</Button></div></div>
          </div>
        </main>
      </div>
    </div>
  );
}

function PatchReview({ navigate }: { navigate: (view: View) => void }) {
  const [showConfirm, setShowConfirm] = useState(false);
  const [editing, setEditing] = useState(false);
  return (
    <div className="page patch-page">
      <div className="page-heading compact-heading"><div><span className="eyebrow">Agent awaiting approval</span><h1>Review evidence-backed patch</h1><p>The agent cannot apply or rerun this change without your approval.</p></div><Badge tone="amber">Approval required</Badge></div>
      <div className="patch-layout">
        <Panel title="Proposed change" eyebrow={`${patch?.file ?? "src/main.c"} · 1 line changed`} className="diff-panel" action={<Badge tone="green">Low risk</Badge>}>
          <div className="diff-context"><span>32</span><code>static void timer_isr(const void *arg)</code></div><div className="diff-context"><span>33</span><code>{"{"}</code></div><div className="diff-context"><span>34</span><code>    TIM2-&gt;SR &amp;= ~TIM_SR_UIF;</code></div>
          <div className="diff-line removed"><span>37</span><b>−</b><code>{`    ${patch ? patch.before : "gpio_pin_set_dt(&orange_led, 1)"};`}</code></div>
          <div className="diff-line added"><span>37</span><b>＋</b>{editing ? <input aria-label="Edited patch" defaultValue={`    ${patch ? patch.after : "gpio_pin_set_dt(&green_led, 1)"};`} /> : <code>{`    ${patch ? patch.after : "gpio_pin_set_dt(&green_led, 1)"};`}</code>}</div>
          <div className="diff-context"><span>38</span><code>{"}"}</code></div>
          <div className="diff-summary"><span><i className="plus">＋1</i><i className="minus">−1</i></span><span>1 file changed</span><span>No configuration changes</span></div>
        </Panel>
        <Panel title="Agent reasoning" eyebrow="Causal path referenced" className="reasoning-panel">
          <p>The trace proves the timer and interrupt path are functioning. The first incorrect state change is the write to GPIO pin 13, which controls the orange LED.</p>
          <div className="reason-path"><button><small>e2</small><strong>IRQ 28</strong></button><span>→</span><button><small>e3</small><strong>timer_isr</strong></button><span>→</span><button><small>e4</small><strong>GPIO 13</strong></button><span>≠</span><button className="expected"><small>expected</small><strong>GPIO 12</strong></button></div>
          <div className="reason-list"><div><span>Expected effect</span><strong>Green LED turns on before 2000 µs</strong></div><div><span>Risk level</span><strong className="text-green">Low · local GPIO target only</strong></div><div><span>Files changed</span><code>src/main.c</code></div><div><span>Tests affected</span><strong>green_led_should_turn_on</strong></div><div><span>Evidence</span><strong><button>[e2]</button> <button>[e3]</button> <button>[e4]</button> <button>[e6]</button></strong></div></div>
          <div className="agent-assurance"><span>◎</span><p><strong>Evidence-backed proposal</strong><br />This correction follows the observed causal path. It is not inferred from naming alone.</p></div>
        </Panel>
      </div>
      <div className="approval-bar"><div><span className="agent-avatar">⌁</span><p><strong>Ready to apply and rerun</strong><br /><small>TraceLoop will rebuild the ELF and execute the same test scenario in Renode.</small></p></div><div><Button tone="danger" onClick={() => navigate("analysis")}>Reject</Button><Button onClick={() => setEditing((value) => !value)}>{editing ? "Save edit" : "Edit patch"}</Button><Button tone="primary" onClick={() => setShowConfirm(true)} testId="approve-patch">Approve and rerun →</Button></div></div>
      {showConfirm && <div className="modal-backdrop"><div className="confirm-modal" role="dialog" aria-modal="true" aria-label="Confirm agent change"><div className="modal-icon">↻</div><h2>Apply patch and rerun?</h2><p>TraceLoop will modify <code>src/main.c</code>, rebuild the firmware, and rerun all 4 tests on STM32F4 Discovery.</p><div className="modal-summary"><span>1 line changed</span><span>Same test inputs</span><span>~42 seconds</span></div><label><input type="checkbox" defaultChecked /> Preserve RUN-1042 for comparison</label><div className="modal-actions"><Button onClick={() => setShowConfirm(false)}>Cancel</Button><Button tone="primary" onClick={() => navigate("success")} testId="confirm-rerun">Apply patch & rerun</Button></div></div></div>}
    </div>
  );
}

function Success({ navigate }: { navigate: (view: View) => void }) {
  const [toast, setToast] = useState("");
  const notify = (message: string) => { setToast(message); window.setTimeout(() => setToast(""), 2200); };
  return (
    <div className="page success-page">
      {toast && <div className="toast"><span>✓</span>{toast}</div>}
      <div className="success-hero"><div className="success-check"><span>✓</span><i /><i /><i /></div><div><span className="eyebrow">RUN-1043 · Rerun complete</span><h1>All 4 tests passed.</h1><p>The green LED turned on at 1004 µs—996 µs before the deadline.</p></div><Badge tone="green">Passed</Badge></div>
      <div className="success-grid">
        <Panel title="Successful execution path" eyebrow="Evidence captured" className="success-path-panel">
          <div className="success-causal"><button>Timer 2 expired<small>1000 µs</small></button><span>→</span><button>IRQ 28 pending<small>1001 µs</small></button><span>→</span><button>timer_isr entered<small>1002 µs</small></button><span>→</span><button className="changed">GPIO pin 12 written<small>1004 µs · corrected</small></button><span>→</span><button className="passed">Green LED on<small>assertion passed</small></button></div>
          <div className="success-timeline"><div className="deadline-line"><span>Deadline · 2000 µs</span></div><div className="success-track"><label>Green LED</label><span className="off">OFF</span><i /><span className="on">ON</span><b>1004 µs</b></div></div>
        </Panel>
        <Panel title="Run metrics" className="success-metrics">
          <div className="score-ring"><strong>4/4</strong><span>tests passed</span></div><div className="metric-list"><div><span>Build</span><strong>9.3 s</strong></div><div><span>Simulation</span><strong>3.0 ms</strong></div><div><span>Deadline margin</span><strong className="text-green">+996 µs</strong></div><div><span>Patch iteration</span><strong>Agent 2</strong></div></div>
        </Panel>
      </div>
      <Panel title="Bad run vs. good run" action={<Button onClick={() => navigate("compare")}>Open detailed comparison →</Button>} className="mini-compare-panel">
        <div className="mini-compare"><div className="bad"><Badge tone="red">RUN-1042 · Failed</Badge><code>GPIOG_ODR[13]  0 → 1</code><span>Orange LED ON</span></div><div className="divergence-arrow"><small>first divergence</small><b>→</b></div><div className="good"><Badge tone="green">RUN-1043 · Passed</Badge><code>GPIOG_ODR[12]  0 → 1</code><span>Green LED ON</span></div></div>
      </Panel>
      <div className="success-actions"><Button onClick={() => navigate("compare")}>⇄ View run comparison</Button><Button onClick={() => notify("Evidence report saved")}>⇩ Save report</Button><Button tone="primary" onClick={() => notify("Patch committed to agent/timer2-led")}>⑂ Commit patch</Button><Button tone="ghost" onClick={() => navigate("agent")}>Continue development →</Button></div>
    </div>
  );
}

function RunComparison({ navigate }: { navigate: (view: View) => void }) {
  const [time, setTime] = useState(1004);
  return (
    <div className="page compare-page">
      <div className="page-heading compact-heading"><div><span className="eyebrow">Synchronized comparison</span><h1>RUN-1042 vs. RUN-1043</h1><p>The first behavioral divergence occurs at <strong>1004 µs</strong>.</p></div><div className="heading-actions"><Badge tone="amber">First divergence</Badge><Button onClick={() => navigate("success")}>Close comparison</Button></div></div>
      <div className="compare-toolbar"><button>‹</button><button className="play">▶</button><span>Synced time cursor</span><input aria-label="Comparison time" type="range" min="0" max="2000" value={time} onChange={(e) => setTime(Number(e.target.value))} /><code>{time} µs</code><button>Next divergence →</button></div>
      <div className="comparison-grid">
        <section className="comparison-side failed-side"><header><div><Badge tone="red">Failed</Badge><strong>RUN-1042</strong></div><span><code>8c47a1d</code> · before patch</span></header><div className="comparison-code"><span>37</span><code>gpio_pin_set_dt(&amp;<b>orange_led</b>, 1);</code></div><div className="comparison-lanes"><label>GPIO pin 13</label><div className="compare-wave bad"><i style={{ left: `${time / 20}%` }} /></div><label>GPIO pin 12</label><div className="compare-wave empty"><i style={{ left: `${time / 20}%` }} /></div></div><div className="mini-board failed"><span className="cpu">MCU</span><span className="led green">PG12<small>OFF</small></span><span className="led orange on">PG13<small>ON</small></span><i className="active-wire" /></div><div className="compare-path"><span>timer_isr</span><b>→</b><span className="bad">GPIO 13</span><b>→</b><span className="bad">Assertion failed</span></div></section>
        <div className="divergence-rail"><span>FIRST<br />DIVERGENCE</span><i /><code>1004 µs</code></div>
        <section className="comparison-side passing-side"><header><div><Badge tone="green">Passed</Badge><strong>RUN-1043</strong></div><span><code>41e9c6b</code> · patched</span></header><div className="comparison-code"><span>37</span><code>gpio_pin_set_dt(&amp;<b>green_led</b>, 1);</code></div><div className="comparison-lanes"><label>GPIO pin 13</label><div className="compare-wave empty"><i style={{ left: `${time / 20}%` }} /></div><label>GPIO pin 12</label><div className="compare-wave good"><i style={{ left: `${time / 20}%` }} /></div></div><div className="mini-board passing"><span className="cpu">MCU</span><span className="led green on">PG12<small>ON</small></span><span className="led orange">PG13<small>OFF</small></span><i className="active-wire" /></div><div className="compare-path"><span>timer_isr</span><b>→</b><span className="good">GPIO 12</span><b>→</b><span className="good">Assertion passed</span></div></section>
      </div>
      <Panel title="Divergence details" className="divergence-details"><div className="divergence-cards"><div><span>Changed source line</span><strong><code>src/main.c:37</code></strong></div><div><span>Register value</span><strong><code>ODR 0x2000 → 0x1000</code></strong></div><div><span>Causal path</span><strong>GPIO 13 → GPIO 12</strong></div><div><span>Timing difference</span><strong className="text-green">0 µs regression</strong></div><div><span>Outcome</span><strong>Green LED ON at 1004 µs</strong></div></div></Panel>
    </div>
  );
}

const runRows = [
  ["RUN-1043", "Today, 11:42", "41e9c6b", "STM32F4 Discovery", "2", "4 / 4", "—", "41.2s", "Passed"],
  ["RUN-1042", "Today, 11:36", "8c47a1d", "STM32F4 Discovery", "1", "3 / 4", "Wrong GPIO pin", "41.8s", "Failed"],
  ["RUN-1041", "Today, 11:18", "39c201f", "STM32F4 Discovery", "1", "4 / 4", "—", "39.6s", "Passed"],
  ["RUN-1040", "Today, 10:57", "d914af0", "Custom Renode", "8", "8 / 14", "—", "2m 14s", "Running"],
  ["RUN-1039", "Today, 10:42", "a03f11e", "nRF52840 DK", "3", "12 / 12", "—", "58.3s", "Passed"],
  ["RUN-1038", "Yesterday", "9f82cd1", "STM32F4 Discovery", "1", "2 / 4", "Timer not enabled", "33.1s", "Failed"],
];

function RunHistory({ navigate }: { navigate: (view: View) => void }) {
  const [status, setStatus] = useState("All statuses");
  const filtered = status === "All statuses" ? runRows : runRows.filter((row) => row[8] === status);
  return (
    <div className="page history-page">
      <div className="page-heading"><div><span className="eyebrow">Trace archive</span><h1>Simulation runs</h1><p>Browse, filter, compare, and reopen every evidence trace.</p></div><Button tone="primary" onClick={() => navigate("create")}>＋ New run</Button></div>
      <div className="filterbar"><label className="search-field"><span>⌕</span><input aria-label="Search runs" placeholder="Search run, branch, test, or root cause…" /></label><select aria-label="Status filter" value={status} onChange={(e) => setStatus(e.target.value)}><option>All statuses</option><option>Failed</option><option>Passed</option><option>Running</option></select><select aria-label="Board filter"><option>All boards</option><option>STM32F4 Discovery</option><option>nRF52840 DK</option></select><select aria-label="Branch filter"><option>All branches</option><option>agent/timer2-led</option><option>main</option></select><button>More filters</button></div>
      <Panel className="table-panel"><div className="data-table"><div className="table-row table-head"><span>Run ID</span><span>Timestamp</span><span>Revision</span><span>Board</span><span>Iteration</span><span>Tests</span><span>Root cause</span><span>Duration</span><span>Status</span></div>{filtered.map((row) => <button className="table-row" key={row[0]} onClick={() => navigate(row[8] === "Failed" ? "analysis" : row[8] === "Running" ? "run" : "success")}><code>{row[0]}</code><span>{row[1]}</span><code>{row[2]}</code><span>{row[3]}</span><span>Agent {row[4]}</span><strong>{row[5]}</strong><span>{row[6]}</span><code>{row[7]}</code><span><Badge tone={row[8] === "Failed" ? "red" : row[8] === "Passed" ? "green" : "blue"}>{row[8]}</Badge></span></button>)}</div><footer className="table-footer"><span>Showing {filtered.length} of 84 runs</span><div><button disabled>‹</button><button className="active">1</button><button>2</button><button>3</button><button>›</button></div></footer></Panel>
    </div>
  );
}

function Platforms({ navigate }: { navigate: (view: View) => void }) {
  const [selected, setSelected] = useState("STM32F4 Discovery");
  const platforms = [
    { name: "STM32F4 Discovery", mcu: "STM32F407VG", arch: "ARM Cortex-M4F", memory: "1 MB Flash · 192 KB SRAM", pins: "16 GPIO · 4 LEDs", status: "Verified" },
    { name: "nRF52840 DK", mcu: "nRF52840", arch: "ARM Cortex-M4F", memory: "1 MB Flash · 256 KB RAM", pins: "48 GPIO · 4 LEDs", status: "Verified" },
    { name: "ESP32-C3 DevKit", mcu: "ESP32-C3", arch: "RISC-V RV32IMC", memory: "4 MB Flash · 400 KB SRAM", pins: "22 GPIO · 1 LED", status: "Beta" },
  ];
  const active = platforms.find((item) => item.name === selected) ?? platforms[0];
  return (
    <div className="page platforms-page">
      <div className="page-heading"><div><span className="eyebrow">Renode compatible</span><h1>Platform library</h1><p>Virtual hardware profiles available to the TraceLoop agent.</p></div><Button onClick={() => navigate("create")}>⇧ Import custom Renode platform</Button></div>
      <div className="platform-layout">
        <div className="platform-list"><label className="search-field"><span>⌕</span><input aria-label="Search platform library" placeholder="Search board or MCU…" /></label>{platforms.map((item) => <button className={`platform-card ${selected === item.name ? "selected" : ""}`} key={item.name} onClick={() => setSelected(item.name)}><div className="platform-thumb"><span>MCU</span><i /><i /><i /></div><div><div className="platform-name"><strong>{item.name}</strong><Badge tone={item.status === "Verified" ? "green" : "amber"}>{item.status}</Badge></div><span>{item.mcu} · {item.arch}</span><small>{item.memory}</small><small>{item.pins}</small></div></button>)}</div>
        <Panel title={active.name} eyebrow="Platform details" className="platform-detail" action={<Button tone="primary" onClick={() => navigate("create")}>Use this board</Button>}>
          <div className="platform-hero-board"><div className="platform-chip"><small>{active.arch}</small><strong>{active.mcu}</strong><span>Renode ready</span></div><span className="diagram-block a">TIM2</span><span className="diagram-block b">NVIC</span><span className="diagram-block c">GPIO</span><span className="diagram-block d">UART</span><i className="platform-pins p1" /><i className="platform-pins p2" /></div>
          <div className="spec-grid"><div><span>Architecture</span><strong>{active.arch}</strong></div><div><span>Memory</span><strong>{active.memory}</strong></div><div><span>GPIO & LEDs</span><strong>{active.pins}</strong></div><div><span>Compatibility</span><strong className="text-green">Trace + causal analysis</strong></div></div>
          <div className="detail-columns"><div><h3>Supported peripherals</h3><div className="cap-list large">{["GPIO", "UART 2/3", "TIM 1–14", "SPI 1–3", "I²C 1–3", "ADC", "DMA", "NVIC"].map((cap) => <span key={cap}>{cap}</span>)}</div><h3>Available outputs</h3><div className="led-list"><span><i className="led-dot green" /> LD4 Green · PG12</span><span><i className="led-dot orange" /> LD3 Orange · PG13</span><span><i className="led-dot red" /> LD5 Red · PG14</span><span><i className="led-dot blue" /> LD6 Blue · PG15</span></div></div><div><h3>Platform files</h3><button className="file-pill"><span>R</span><div><strong>stm32f4_discovery.repl</strong><small>Board platform definition</small></div><code>12.4 KB</code></button><button className="file-pill"><span>R</span><div><strong>stm32f4_discovery.resc</strong><small>Initialization script</small></div><code>3.1 KB</code></button><h3>Example firmware</h3><button className="sample-row"><span>▤</span><div><strong>Timer-driven LED</strong><small>Zephyr · C · 4 tests</small></div><b>›</b></button></div></div>
        </Panel>
      </div>
    </div>
  );
}

function TestsAndReports({ view, navigate }: { view: "tests" | "reports"; navigate: (view: View) => void }) {
  const tests = [["green_led_should_turn_on", "Timer LED Controller", "Failed", "GPIO pin 12 = 1 by 2000 µs"], ["timer2_irq_fires", "Timer LED Controller", "Passed", "IRQ 28 pending by 1100 µs"], ["uart_frame_forwarded", "UART Sensor Gateway", "Passed", "Frame echoed within 8 ms"], ["overcurrent_latches_pwm", "Motor Safety Controller", "Running", "PWM disabled when current > 4.2 A"]];
  return <div className="page simple-page"><div className="page-heading"><div><span className="eyebrow">{view === "tests" ? "Scenario library" : "Shareable evidence"}</span><h1>{view === "tests" ? "Test scenarios" : "Evidence reports"}</h1><p>{view === "tests" ? "Reusable hardware inputs and assertions for Renode runs." : "Causal findings, run comparisons, and sign-off artifacts."}</p></div><Button tone="primary" onClick={() => navigate("create")}>＋ {view === "tests" ? "New scenario" : "Generate report"}</Button></div><div className="simple-grid">{(view === "tests" ? tests : tests.slice(0, 3).map((item, index) => [`Trace report · ${item[0]}`, `RUN-${1042 - index}`, index === 0 ? "Draft" : "Ready", index === 0 ? "6 cited events · root cause" : "Passing run · evidence bundle"])).map((item) => <button className="simple-card" key={item[0]} onClick={() => navigate(item[2] === "Failed" || item[2] === "Draft" ? "analysis" : "success")}><div><Badge tone={item[2] === "Failed" ? "red" : item[2] === "Running" || item[2] === "Draft" ? "amber" : "green"}>{item[2]}</Badge><span className="card-menu">•••</span></div><strong>{item[0]}</strong><span>{item[1]}</span><p>{item[3]}</p><small>Updated today · Open →</small></button>)}</div></div>;
}

function Settings() {
  const [permission, setPermission] = useState("Review every patch");
  return (
    <div className="page settings-page">
      <div className="page-heading"><div><span className="eyebrow">Workspace configuration</span><h1>Settings & integrations</h1><p>Control tools, model access, permissions, and trace retention.</p></div><Badge tone="green">All core systems ready</Badge></div>
      <div className="settings-layout"><aside className="settings-nav">{["Runtime & toolchains", "Source control", "Agent & models", "Permissions", "Data retention", "Notifications"].map((item, index) => <button className={index === 0 ? "active" : ""} key={item}>{item}<span>›</span></button>)}</aside><main className="settings-main"><Panel title="Runtime & toolchains" eyebrow="Local execution"><div className="integration-list">{[["Renode", "1.15.3", "Connected", "Virtual hardware simulation"], ["Zephyr SDK", "0.17.2", "Ready", "ARM and RISC-V toolchains"], ["CMake + Ninja", "3.29 · 1.12", "Ready", "Firmware build system"], ["MCP server", "traceloop-renode", "Connected", "Agent tool bridge"]].map(([name, version, status, desc]) => <div className="integration-row" key={name}><span className="integration-icon">{name.slice(0, 2).toUpperCase()}</span><div><strong>{name}</strong><small>{desc}</small></div><code>{version}</code><Badge tone="green">● {status}</Badge><button>Configure</button></div>)}</div></Panel><Panel title="Connections"><div className="integration-list"><div className="integration-row"><span className="integration-icon git">⑂</span><div><strong>GitHub</strong><small>traceloop-labs · 12 repositories</small></div><Badge tone="green">Connected</Badge><button>Manage</button></div><div className="integration-row"><span className="integration-icon">ZE</span><div><strong>Zephyr SDK</strong><small>Author, build & simulate firmware for the agent</small></div><Badge tone="green">Connected</Badge><button>Manage</button></div></div></Panel><Panel title="Agent configuration"><div className="settings-form"><label><span>AI model</span><select><option>GPT-5.2 · firmware agent</option></select></label><label><span>Source-change permission</span><select value={permission} onChange={(e) => setPermission(e.target.value)}><option>Review every patch</option><option>Allow low-risk changes</option></select></label><label><span>Trace retention</span><select><option>90 days</option><option>30 days</option><option>1 year</option></select></label></div><div className="permission-callout"><span>◎</span><div><strong>Human approval stays in the loop</strong><p>Destructive commands, firmware source changes, commits, and external side effects require explicit approval.</p></div></div></Panel></main></div>
    </div>
  );
}

function FSMView({ navigate }: { navigate: (view: View) => void }) {
  const [taskId, setTaskId] = useState<string>("");
  const [showInput, setShowInput] = useState(true);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (taskId.trim()) {
      setShowInput(false);
    }
  };

  if (showInput) {
    return (
      <div className="page">
        <div className="page-heading">
          <div>
            <span className="eyebrow">Agent State Machine</span>
            <h1>FSM Visualization</h1>
            <p>Monitor and control the agent's state machine in real-time.</p>
          </div>
        </div>
        <div className="bg-gray-900 rounded-lg p-8 border border-gray-800 max-w-2xl">
          <h2 className="text-xl font-semibold text-white mb-4">Enter Task ID</h2>
          <p className="text-gray-400 text-sm mb-6">
            Enter the ID of a task to visualize its state machine progression.
          </p>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="taskId" className="block text-sm font-medium text-gray-300 mb-2">
                Task ID
              </label>
              <input
                id="taskId"
                type="text"
                value={taskId}
                onChange={(e) => setTaskId(e.target.value)}
                placeholder="e.g., 123e4567-e89b-12d3-a456-426614174000"
                className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>
            <button
              type="submit"
              className="w-full px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors"
            >
              Load Task State Machine
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="page-heading">
        <div>
          <span className="eyebrow">Agent State Machine</span>
          <h1>FSM Visualization</h1>
          <p>Task: {taskId}</p>
        </div>
        <button
          onClick={() => setShowInput(true)}
          className="button button-secondary"
        >
          Change Task
        </button>
      </div>
      <FSMIntegration taskId={taskId} />
    </div>
  );
}

export default function Home() {
  const [view, setView] = useState<View>("analysis");
  const [navOpen, setNavOpen] = useState(false);
  const [notifications, setNotifications] = useState(false);
  const activeNav = useMemo(() => {
    if (["analysis", "run", "success", "compare", "history", "patch"].includes(view)) return "history";
    if (view === "create") return "dashboard";
    if (view === "fsm") return "fsm";
    return view;
  }, [view]);
  const navigate = (next: View) => { setView(next); setNavOpen(false); window.scrollTo({ top: 0, behavior: "smooth" }); };

  return (
    <div className="app-shell">
      <aside className={`sidebar ${navOpen ? "open" : ""}`}>
        <div className="sidebar-brand"><Logo /><button className="mobile-close" onClick={() => setNavOpen(false)}>×</button></div>
        <nav>{navItems.slice(0, 6).map((item) => <button key={item.label} className={activeNav === item.view ? "active" : ""} onClick={() => navigate(item.view)} data-testid={`nav-${item.view}`}><span>{item.icon}</span><strong>{item.label}</strong>{item.label === "Runs" && <small>3</small>}</button>)}</nav>
        <div className="sidebar-bottom"><nav>{navItems.slice(6).map((item) => <button key={item.label} className={activeNav === item.view ? "active" : ""} onClick={() => navigate(item.view)}><span>{item.icon}</span><strong>{item.label}</strong></button>)}</nav><div className="renode-status"><i /><div><strong>Renode connected</strong><small>v1.15.3 · local</small></div></div></div>
      </aside>
      {navOpen && <button className="nav-backdrop" aria-label="Close navigation" onClick={() => setNavOpen(false)} />}
      <div className="app-main">
        <header className="global-topbar">
          <div className="topbar-left"><button className="menu-button" aria-label="Open navigation" onClick={() => setNavOpen(true)}>☰</button><div className="breadcrumb"><span>{screenTitles[view]}</span><b>Timer LED Controller</b></div></div>
          <div className="project-context"><button><small>Project</small><strong>Timer LED Controller⌄</strong></button><span /><button><small>Board</small><strong>STM32F4 Discovery⌄</strong></button><span /><button><small>Branch</small><strong>⑂ agent/timer2-led⌄</strong></button></div>
          <div className="topbar-actions"><button className="connection-pill"><i /> Renode</button><button className="notification-button" onClick={() => setNotifications((value) => !value)} aria-label="Notifications">♢<i /></button><button className="avatar-button">AK</button></div>
          {notifications && <div className="notification-popover"><header><strong>Notifications</strong><button onClick={() => setNotifications(false)}>×</button></header><div><span className="notify-icon fail">!</span><p><strong>RUN-1042 needs attention</strong><small>Root cause found · 6m ago</small></p></div><div><span className="notify-icon pass">✓</span><p><strong>UART gateway patch passed</strong><small>12 tests passed · 42m ago</small></p></div></div>}
        </header>
        <div className="route-stage" key={view}>
          {view === "dashboard" && <Dashboard navigate={navigate} />}
          {view === "create" && <CreateProject navigate={navigate} />}
          {view === "agent" && <AgentWorkspace navigate={navigate} />}
          {view === "run" && <RunProgress navigate={navigate} />}
          {view === "analysis" && <FailureAnalysis navigate={navigate} />}
          {view === "patch" && <PatchReview navigate={navigate} />}
          {view === "success" && <Success navigate={navigate} />}
          {view === "compare" && <RunComparison navigate={navigate} />}
          {view === "history" && <RunHistory navigate={navigate} />}
          {view === "platforms" && <Platforms navigate={navigate} />}
          {(view === "tests" || view === "reports") && <TestsAndReports view={view} navigate={navigate} />}
          {view === "settings" && <Settings />}
          {view === "fsm" && <FSMView navigate={navigate} />}
        </div>
      </div>
    </div>
  );
}
