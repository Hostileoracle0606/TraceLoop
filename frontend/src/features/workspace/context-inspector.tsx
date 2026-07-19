import { useMemo } from 'react';
import {
  Check,
  ChevronDown,
  CircuitBoard,
  CircleAlert,
  Code2,
  ExternalLink,
  FileCode2,
  GitBranch,
  Network,
  Search,
  TestTube2,
  X,
} from 'lucide-react';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { cn } from '../../lib/utils';
import { SchematicCanvas } from './schematic-canvas';
import type { InspectorTab } from './types';
import type { WorkspaceController } from './use-workspace-controller';

function CodeInspector({ controller }: { controller: WorkspaceController }) {
  const files = Object.keys(controller.session.files);
  const source = controller.session.files[controller.selectedFile] ?? '';
  const lines = useMemo(() => source.split('\n'), [source]);
  const hasRuntimeCause = controller.session.evidence.some((event) => event.id === 'e4');
  return (
    <div className="inspector-view code-inspector">
      <div className="file-picker">
        <FileCode2 size={14} />
        <select aria-label="Open file" value={controller.selectedFile} onChange={(event) => controller.setSelectedFile(event.target.value)}>
          {files.map((file) => <option value={file} key={file}>{file}</option>)}
        </select>
        <Badge tone="neutral">C</Badge>
        <ChevronDown size={12} />
      </div>
      <div className="code-surface" aria-label={`${controller.selectedFile} source preview`}>
        <div className="code-surface__top"><span>{controller.selectedFile}</span><small>Read-only snapshot</small></div>
        <pre>
          {lines.map((line, index) => {
            const lineNumber = index + 1;
            const highlighted = line.includes('orange_led') && line.includes('gpio_pin_set_dt');
            return (
              <span className={cn('code-line', highlighted && 'is-highlighted')} key={`${lineNumber}-${line}`}>
                <i>{lineNumber}</i><code>{line || ' '}</code>{highlighted && <em>cause</em>}
              </span>
            );
          })}
        </pre>
      </div>
      <div className="inspector-callout">
        {hasRuntimeCause ? <CircleAlert size={15} /> : <Check size={15} />}
        <div>
          <strong>{hasRuntimeCause ? 'Matched to the runtime trace' : 'Synced with the system model'}</strong>
          <p>{hasRuntimeCause ? <>The PG13 write points to this LED binding inside <code>timer_isr</code>.</> : <>This source is built for <code>{controller.session.schematic.fileName}</code> and runs inside the complete simulated system.</>}</p>
        </div>
      </div>
    </div>
  );
}

function SchematicInspector({ controller }: { controller: WorkspaceController }) {
  const schematic = controller.session.schematic;
  const controllers = schematic.nodes.filter((node) => node.kind === 'controller' || node.kind === 'radio');
  return (
    <div className="inspector-view schematic-inspector">
      <div className="board-summary">
        <span className="board-summary__chip"><CircuitBoard size={22} /></span>
        <span><small>Source schematic</small><strong>{schematic.fileName}</strong><em>{schematic.componentCount} components · {schematic.controllerCount} controllers</em></span>
      </div>
      <div className="schematic-inspector__canvas">
        <div className="virtual-board__grid" />
        <SchematicCanvas schematic={schematic} compact />
      </div>
      <div className="hardware-state-list">
        {controllers.map((node) => (
          <div key={node.id}><span><CircuitBoard size={14} /> {node.reference}</span><strong>{node.name} · {node.detail}</strong><Badge tone="green">Modeled</Badge></div>
        ))}
        <div><span><Network size={14} /> Buses</span><strong>{schematic.buses.join(' · ')}</strong><Badge tone="neutral">Connected</Badge></div>
      </div>
    </div>
  );
}

function EvidenceInspector({ controller }: { controller: WorkspaceController }) {
  const { evidence, testSummary } = controller.session;
  const failed = controller.session.status === 'failed';
  return (
    <div className="inspector-view evidence-inspector">
      <div className={cn('assertion-card', !failed && 'is-passed')}>
        <div><span><TestTube2 size={15} /></span><span><small>{failed ? 'Failed check' : 'System check'}</small><strong>{testSummary.assertion}</strong></span><Badge tone={failed ? 'red' : 'green'}>{failed ? 'Failed' : 'Passed'}</Badge></div>
        <dl><div><dt>Expected</dt><dd>{testSummary.expected}</dd></div><div><dt>Observed</dt><dd>{testSummary.observed}</dd></div></dl>
      </div>
      <div className="evidence-heading"><span>Relevant events</span><small>{evidence.length ? `${evidence.length} of 1,284 events` : 'No divergences'}</small></div>
      <div className="evidence-timeline">
        {evidence.map((event) => (
          <div className={cn('evidence-event', `is-${event.tone}`)} key={event.id}>
            <time>{event.time}<small>µs</small></time>
            <span className="evidence-event__rail"><i /></span>
            <div><strong>{event.label}</strong><p>{event.detail}</p><code>{event.register} · {event.value}</code></div>
          </div>
        ))}
      </div>
      <button className="open-analysis-button" disabled title="Full trace viewer is not connected yet"><GitBranch size={14} /> Full trace viewer · not connected yet <ExternalLink size={13} /></button>
    </div>
  );
}

const tabs: Array<{ id: InspectorTab; label: string; icon: typeof Code2 }> = [
  { id: 'code', label: 'Code', icon: Code2 },
  { id: 'schematic', label: 'Schematic', icon: CircuitBoard },
  { id: 'evidence', label: 'Trace', icon: GitBranch },
];

export function ContextInspector({ controller }: { controller: WorkspaceController }) {
  const visibleTabs = controller.session.origin === 'live' ? tabs.filter((tab) => tab.id !== 'schematic') : tabs;
  return (
    <aside className={cn('context-inspector', controller.inspectorOpen && 'is-open')}>
      <header className="context-inspector__header">
        <div><strong>Task context</strong><small>Files, schematic, and runtime trace</small></div>
        <div>
          <Button variant="ghost" size="icon" aria-label="Context search is not connected yet" title="Not connected yet" disabled><Search size={16} /></Button>
          <Button variant="ghost" size="icon" aria-label="Close context inspector" onClick={() => controller.setInspectorOpen(false)}><X size={17} /></Button>
        </div>
      </header>
      <div className="inspector-tabs" role="tablist" aria-label="Task context">
        {visibleTabs.map(({ id, label, icon: Icon }) => (
          <button role="tab" aria-selected={controller.inspectorTab === id} className={cn(controller.inspectorTab === id && 'is-active')} onClick={() => controller.setInspectorTab(id)} key={id}>
            <Icon size={14} /> {label}
          </button>
        ))}
      </div>
      {controller.inspectorTab === 'code' && <CodeInspector controller={controller} />}
      {controller.inspectorTab === 'schematic' && <SchematicInspector controller={controller} />}
      {controller.inspectorTab === 'evidence' && <EvidenceInspector controller={controller} />}
      <footer className="context-inspector__footer"><Check size={13} /> Read-only view</footer>
    </aside>
  );
}
