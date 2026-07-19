import { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  CircleDot,
  CircuitBoard,
  FileCode2,
  GitBranch,
  Menu,
  Pause,
  Play,
  Sparkles,
} from 'lucide-react';
import { Button } from '../../components/ui/button';
import { cn } from '../../lib/utils';
import { ModeSwitch, RenodeStatus } from './mode-switch';
import { SchematicCanvas } from './schematic-canvas';
import { TaskAttentionBar } from './task-attention-bar';
import type { WorkspaceController } from './use-workspace-controller';

const replayFrames = [
  { label: 'TIM2 update', time: 1000, detail: 'Update flag asserted' },
  { label: 'IRQ 28', time: 1001, detail: 'Interrupt pending' },
  { label: 'timer_isr', time: 1002, detail: 'Handler entered' },
  { label: 'PG13 write', time: 1004, detail: 'GPIO diverged' },
  { label: 'Patch preview', time: 1004, detail: 'Changing orange_led → green_led' },
];

const systemReplayFrames = [
  { label: 'Sensors sampled', time: 240, detail: 'TMP117 and LSM6DSO readings ready' },
  { label: 'ECU-A published', time: 510, detail: 'Sensor state encoded as CAN frame 0x241' },
  { label: 'ECU-B routed', time: 790, detail: 'Gateway validated the frame and split the route' },
  { label: 'Radio notified', time: 1060, detail: 'State forwarded to nRF52840 over SPI / HCI' },
  { label: 'Telemetry synced', time: 1380, detail: 'Gateway received a cloud acknowledgement' },
];

const buildStages = [
  { label: 'Reading source', detail: 'Loading symbols, references, and net definitions' },
  { label: 'Placing controllers', detail: 'Creating programmable devices and memory regions' },
  { label: 'Routing interfaces', detail: 'Connecting buses, interrupts, and peripherals' },
  { label: 'Starting simulation', detail: 'Booting the complete system in Renode' },
];

function SimulationPartition({
  controller,
  frame,
  buildStep,
  isPlaying,
  onTogglePlayback,
}: {
  controller: WorkspaceController;
  frame: number;
  buildStep: number;
  isPlaying: boolean;
  onTogglePlayback: () => void;
}) {
  const schematic = controller.session.schematic;
  const isBuilding = controller.workspacePhase === 'building';
  const isSystem = schematic.controllerCount > 1;
  const frames = isSystem ? systemReplayFrames : replayFrames;
  const current = frames[frame] ?? frames[0];
  const build = buildStages[buildStep] ?? buildStages[0];
  const patchPreview = !isSystem && frame === replayFrames.length - 1;
  const buildProgress = Math.round(((buildStep + 1) / buildStages.length) * 100);
  const runtimeLabel = controller.session.origin === 'example' ? 'Renode · sample replay' : 'Renode · live';

  return (
    <section className={cn('workbench-partition simulation-partition', isBuilding && 'is-building')}>
      <header className="partition-header">
        <div><span className="partition-icon"><Activity size={14} /></span><span><strong>Virtual hardware</strong><small>{schematic.fileName} · {schematic.componentCount} components</small></span></div>
        <span className={cn('partition-runtime', isBuilding && 'is-building')}><i />{isBuilding ? `${buildProgress}% constructed` : runtimeLabel}</span>
      </header>

      <div className="simulation-stage">
        <div className="simulation-grid" />
        <div className={cn('simulation-board', isSystem && 'simulation-board--system', !isSystem && 'simulation-board--single', isBuilding && 'is-building')}>
          <div className="simulation-board__legend"><span>VIRTUAL PCB</span><code>{schematic.id.toUpperCase()}</code></div>
          <SchematicCanvas schematic={schematic} frame={isBuilding ? buildStep : frame} building={isBuilding} />
        </div>
      </div>

      <div className={cn('simulation-event', patchPreview && 'is-patch', isSystem && 'is-system', isBuilding && 'is-building')}>
        {isBuilding ? <CircuitBoard size={14} /> : <CircleDot size={14} />}
        <strong>{isBuilding ? build.label : current.label}</strong>
        <span>{isBuilding ? build.detail : current.detail}</span>
        <code>{isBuilding ? `${buildProgress}%` : `${current.time} µs`}</code>
      </div>

      {isBuilding ? (
        <footer className="build-timeline" aria-label="Virtual system construction progress">
          {buildStages.map((stage, index) => (
            <span className={cn(index < buildStep && 'is-complete', index === buildStep && 'is-active')} key={stage.label}>
              <i /> <small>{stage.label}</small>
            </span>
          ))}
        </footer>
      ) : (
        <footer className="trace-scrubber">
          <button aria-label={isPlaying ? 'Pause trace replay' : 'Play trace replay'} onClick={onTogglePlayback}>{isPlaying ? <Pause size={11} /> : <Play size={11} />}</button>
          <code>0 µs</code>
          <div className="trace-scrubber__track">
            <span style={{ width: `${((frame + 1) / frames.length) * 100}%` }} />
            {frames.map((item, index) => <i className={cn(index <= frame && 'is-past')} style={{ left: `${(index / (frames.length - 1)) * 100}%` }} key={item.label} />)}
          </div>
          <code>{isSystem ? '1600' : '2000'} µs</code>
          <span>1×</span>
        </footer>
      )}
    </section>
  );
}

function CodePartition({ controller, frame, isAuthoring }: { controller: WorkspaceController; frame: number; isAuthoring: boolean }) {
  const files = Object.keys(controller.session.files);
  const source = controller.session.files[controller.selectedFile] ?? '';
  const patchPreview = frame === replayFrames.length - 1;
  const hasDiagnostic = source.includes('orange_led');
  const renderedLines = useMemo(() => {
    const lines = source.split('\n');
    if (controller.selectedFile !== 'src/main.c') return lines.map((text, index) => ({ number: index + 1, text }));
    return lines.slice(28, 63).map((text, index) => ({ number: index + 29, text }));
  }, [controller.selectedFile, source]);

  return (
    <section className="workbench-partition code-partition">
      <header className="code-authoring-header">
        <div><span><Sparkles size={12} /></span><span><strong>{isAuthoring ? 'Writing firmware' : 'Firmware workspace'}</strong><small>{isAuthoring ? 'The first source changes are now visible' : `${files.length} project files`}</small></span></div>
        <span className={cn('authoring-state', isAuthoring && 'is-active')}><i />{isAuthoring ? 'Agent editing' : controller.session.origin === 'example' ? 'Sample source' : 'Source ready'}</span>
      </header>
      <div className="code-workspace">
        <div className="workbench-file-tabs" role="tablist" aria-label="Open source files">
          <small>FILES</small>
          {files.map((file) => (
            <button
              role="tab"
              aria-selected={controller.selectedFile === file}
              className={cn(controller.selectedFile === file && 'is-active')}
              onClick={() => controller.setSelectedFile(file)}
              title={file}
              key={file}
            >
              <FileCode2 size={12} /><span>{file}</span>
            </button>
          ))}
        </div>
        <div className="code-editor-frame">
          <div className="workbench-editor">
            <div className="editor-gutter-rail">{hasDiagnostic && <span className="editor-diagnostic" style={{ top: '47%' }} />}</div>
            <pre>
              {renderedLines.map(({ number, text }, index) => {
                const rootLine = text.includes('gpio_pin_set_dt(&orange_led');
                const displayedText = rootLine && patchPreview ? text.replace('orange_led', 'green_led') : text;
                const isRevealing = isAuthoring && Boolean(text.trim()) && index < 9;
                return (
                  <span
                    className={cn('workbench-code-line', rootLine && 'is-root', rootLine && patchPreview && 'is-writing', isRevealing && 'is-revealing')}
                    style={isRevealing ? { animationDelay: `${index * 70}ms` } : undefined}
                    key={`${number}-${text}`}
                  >
                    <i>{number}</i>
                    <code>{displayedText || ' '}</code>
                  </span>
                );
              })}
            </pre>
          </div>
          <footer className="editor-statusbar">
            <span>C · Zephyr</span>
            <span>Ln 43, Col 5</span>
          </footer>
        </div>
      </div>
    </section>
  );
}

export function WorkbenchCanvas({ controller }: { controller: WorkspaceController }) {
  const [frame, setFrame] = useState(0);
  const [buildStep, setBuildStep] = useState(0);
  const [isPlaying, setIsPlaying] = useState(true);
  const isBuilding = controller.workspacePhase === 'building';
  const showCode = controller.workspacePhase === 'coding' || controller.hasAuthoredCode;
  const isAuthoring = controller.workspacePhase === 'coding' && controller.session.origin === 'upload' && controller.session.status === 'active';

  useEffect(() => {
    if (!isBuilding) return undefined;
    setBuildStep(0);
    const timer = window.setInterval(() => setBuildStep((current) => Math.min(current + 1, buildStages.length - 1)), 500);
    return () => window.clearInterval(timer);
  }, [isBuilding, controller.session.id]);

  useEffect(() => {
    if (!isPlaying || isBuilding) return undefined;
    const timer = window.setInterval(() => setFrame((current) => (current + 1) % replayFrames.length), 1_650);
    return () => window.clearInterval(timer);
  }, [isBuilding, isPlaying]);

  return (
    <main className="workbench-canvas">
      <header className="workbench-header">
        <div>
          <Button className="mobile-only" variant="ghost" size="icon" aria-label="Open sidebar" onClick={() => controller.setSidebarOpen(true)}><Menu size={18} /></Button>
          <span><strong>{controller.session.schematic.displayName}</strong><small>{controller.session.schematic.fileName} · {controller.session.schematic.controllerCount} controller{controller.session.schematic.controllerCount === 1 ? '' : 's'} · <GitBranch size={10} /> {controller.session.branch}</small></span>
        </div>
        <div><ModeSwitch controller={controller} /><RenodeStatus controller={controller} /></div>
      </header>
      <TaskAttentionBar controller={controller} />
      <div className={cn('workbench-stage', isBuilding && 'workbench-stage--building', !showCode && !isBuilding && 'workbench-stage--ready', showCode && 'workbench-stage--coding')}>
        <SimulationPartition controller={controller} frame={frame} buildStep={buildStep} isPlaying={isPlaying} onTogglePlayback={() => setIsPlaying((playing) => !playing)} />
        {showCode && <div className="partition-divider" aria-hidden="true"><span /></div>}
        {showCode && <CodePartition controller={controller} frame={frame} isAuthoring={isAuthoring} />}
      </div>
    </main>
  );
}
