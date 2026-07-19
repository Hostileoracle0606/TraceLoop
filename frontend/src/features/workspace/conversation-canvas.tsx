import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronDown,
  Circle,
  CircleAlert,
  Code2,
  CircuitBoard,
  FileCheck2,
  FileCode2,
  FileText,
  GitBranch,
  Menu,
  MoreHorizontal,
  Network,
  PanelRight,
  Play,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  Timer,
  Wrench,
  X,
} from 'lucide-react';
import { Avatar } from '../../components/ui/avatar';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { Card } from '../../components/ui/card';
import { Progress } from '../../components/ui/progress';
import { cn } from '../../lib/utils';
import { ChatComposer } from './chat-composer';
import { ModeSwitch, RenodeStatus } from './mode-switch';
import { SchematicUploader } from './schematic-uploader';
import { TaskAttentionBar } from './task-attention-bar';
import type { ActivityStep } from './types';
import type { WorkspaceController } from './use-workspace-controller';

function MessageShell({ role, children }: { role: 'user' | 'agent'; children: React.ReactNode }) {
  return (
    <article className={cn('message', `message--${role}`)}>
      <Avatar fallback={role === 'agent' ? 'TL' : 'TG'} tone={role === 'agent' ? 'agent' : 'user'} />
      <div className="message__body">{children}</div>
    </article>
  );
}

function StepIcon({ step }: { step: ActivityStep }) {
  if (step.state === 'complete') return <Check size={13} />;
  if (step.state === 'failed') return <X size={13} />;
  if (step.state === 'active') return <span className="thinking-dot" />;
  return <Circle size={8} />;
}

function ExecutionCard({ steps }: { steps: ActivityStep[] }) {
  const complete = steps.filter((step) => step.state === 'complete').length;
  const progress = Math.round((complete / Math.max(steps.length, 1)) * 100);
  const isActive = steps.some((step) => step.state === 'active');
  const needsReview = steps.some((step) => step.state === 'failed');
  return (
    <Card className="execution-card">
      <header className="execution-card__header">
        <div><span className="tool-icon"><Play size={15} /></span><span><strong>{isActive ? 'Working on your task' : needsReview ? 'Ready for review' : 'Task complete'}</strong><small>Plan · code · build · test</small></span></div>
        <Badge tone={isActive ? 'violet' : needsReview ? 'amber' : 'green'}>
          {isActive ? 'In progress' : needsReview ? 'Needs review' : 'Done'}
        </Badge>
      </header>
      <Progress value={progress} />
      <div className="execution-steps">
        {steps.map((step) => (
          <div className={cn('execution-step', `is-${step.state}`)} key={step.id}>
            <span className="execution-step__state"><StepIcon step={step} /></span>
            <span><strong>{step.label}</strong><small>{step.detail}</small></span>
            {step.duration && <time>{step.duration}</time>}
          </div>
        ))}
      </div>
      <button className="execution-card__footer" disabled title="Build-log viewer is not connected yet"><Code2 size={13} /> Build log viewer · not connected yet <ChevronDown size={13} /></button>
    </Card>
  );
}

const planningSteps = [
  { icon: Network, label: 'Tracing the requested behavior', detail: 'Following the relevant nets, buses, and device boundaries' },
  { icon: CircuitBoard, label: 'Choosing firmware targets', detail: 'Identifying which controllers and interfaces need changes' },
  { icon: FileCheck2, label: 'Defining simulation checks', detail: 'Turning the request into observable pass conditions' },
];

function ThinkingCard() {
  return (
    <Card className="thinking-card" aria-live="polite">
      <header>
        <span className="thinking-card__orb"><Sparkles size={15} /></span>
        <span><strong>Planning the implementation</strong><small>Building a visible plan before editing your firmware</small></span>
        <Badge tone="violet"><i /> Thinking</Badge>
      </header>
      <div className="thinking-card__steps">
        {planningSteps.map((step, index) => {
          const Icon = step.icon;
          return (
            <div className="thinking-card__step" style={{ animationDelay: `${index * 260}ms` }} key={step.label}>
              <span><Icon size={13} /></span>
              <span><strong>{step.label}</strong><small>{step.detail}</small></span>
              <i />
            </div>
          );
        })}
      </div>
      <footer><span /><small>No files are created until the plan reaches the authoring step.</small></footer>
    </Card>
  );
}

function RootCauseCard({ controller }: { controller: WorkspaceController }) {
  const root = controller.session.evidence.find((event) => event.id === 'e4') ?? controller.session.evidence.at(-1);
  return (
    <Card className="root-cause-card">
      <header>
        <span className="root-cause-card__icon"><CircleAlert size={17} /></span>
        <span><small>Why it failed</small><strong>{root?.label ?? 'Still investigating'}</strong></span>
        {root && controller.session.origin === 'example' && <Badge tone="amber">Sample evidence</Badge>}
      </header>
      {root && (
        <>
          <p>{root.detail} At <code>{root.time} µs</code>, the trace observed <code>{root.register}</code> as <code>{root.value}</code>.</p>
          <button className="text-action" onClick={() => { controller.setInspectorTab('evidence'); controller.setInspectorOpen(true); }}>
            View runtime trace <ArrowRight size={13} />
          </button>
        </>
      )}
    </Card>
  );
}

function PatchCard({ controller }: { controller: WorkspaceController }) {
  const patch = controller.currentPatch;
  const isSample = controller.session.origin === 'example';
  const before = patch?.before ?? 'gpio_pin_set_dt(&orange_led, 1);';
  const after = patch?.after ?? 'gpio_pin_set_dt(&green_led, 1);';
  const file = patch?.file ?? 'src/main.c';
  const decided = patch && patch.status !== 'proposed';
  return (
    <Card className={cn('patch-card', decided && 'is-approved')}>
      <header>
        <div><span className="tool-icon tool-icon--green"><Wrench size={15} /></span><span><strong>{isSample ? 'Sample fix' : decided ? `Patch ${patch.status}` : 'Fix ready'}</strong><small>1 file · exact source replacement · tests unchanged</small></span></div>
        <Badge tone={decided ? 'green' : 'neutral'}>{isSample ? 'Read-only sample' : decided ? patch.status : 'Ready to review'}</Badge>
      </header>
      <div className="diff-preview">
        <div className="diff-preview__file"><FileCode2 size={13} /> {file} <span>1 replacement</span></div>
        <pre><span className="diff-remove">− {before}</span>{'\n'}<span className="diff-add">+ {after}</span></pre>
      </div>
      <footer>
        <span><ShieldCheck size={14} /> Existing tests stay in place</span>
        {!isSample && patch?.status === 'proposed' && <div>
          <Button variant="ghost" size="sm" onClick={() => void controller.rejectPatch()} disabled={controller.patchActionPending}>Request changes</Button>
          <Button size="sm" onClick={() => void controller.approvePatch()} disabled={controller.patchActionPending}>
            {controller.patchActionPending ? <><RotateCcw size={14} /> Saving decision</> : <><CheckCircle2 size={14} /> Approve & rerun</>}
          </Button>
        </div>}
      </footer>
      {controller.patchActionError && <p className="patch-card__error">{controller.patchActionError}</p>}
    </Card>
  );
}

function WorkspaceHeader({ controller }: { controller: WorkspaceController }) {
  return (
    <header className="conversation-header">
      <div>
        <Button className="mobile-only" variant="ghost" size="icon" aria-label="Open sidebar" onClick={() => controller.setSidebarOpen(true)}><Menu size={18} /></Button>
        <span className="conversation-header__title"><strong>{controller.session.title}</strong><small>{controller.session.origin === 'example' ? 'Read-only sample project' : controller.session.boardName}</small></span>
      </div>
      <div className="conversation-header__meta">
        <span title={controller.session.origin === 'live' ? 'Git integration is not connected yet' : undefined}><GitBranch size={13} /> {controller.session.branch}</span>
        <ModeSwitch controller={controller} />
        <RenodeStatus controller={controller} />
        <Button variant="ghost" size="icon" aria-label="Open context inspector" onClick={() => controller.setInspectorOpen(true)}><PanelRight size={17} /></Button>
        <Button variant="ghost" size="icon" aria-label="More task actions are not connected yet" title="Not connected yet" disabled><MoreHorizontal size={18} /></Button>
      </div>
    </header>
  );
}

function NewTask({ controller }: { controller: WorkspaceController }) {
  return (
    <div className="new-task-view">
      <Button className="new-task-back" variant="ghost" size="icon" aria-label="Back to projects" onClick={() => controller.openConversation('demo-vehicle')}><ArrowLeft size={17} /></Button>
      <div className="new-task-view__content">
        <span className="new-task-mark"><CircuitBoard size={22} /></span>
        <p className="eyebrow">Planned capability</p>
        <h1>Schematic import is not connected yet.</h1>
        <p>The upload parser and interactive canvas are still under development. You can inspect the read-only sample without implying that uploaded files are processed.</p>
        <SchematicUploader controller={controller} />
      </div>
      <footer><ShieldCheck size={13} /> Your schematic stays in this project · generated changes remain reviewable</footer>
    </div>
  );
}

function SchematicReadyCard({ controller }: { controller: WorkspaceController }) {
  const schematic = controller.session.schematic;
  return (
    <Card className="schematic-ready-card">
      <header>
        <span className="tool-icon tool-icon--green"><FileCheck2 size={15} /></span>
        <span><strong>Virtual hardware ready</strong><small>{schematic.fileName}</small></span>
        <Badge tone="green">Built</Badge>
      </header>
      <div className="schematic-ready-card__stats">
        <span><strong>{schematic.componentCount}</strong><small>components</small></span>
        <span><strong>{schematic.controllerCount}</strong><small>controllers</small></span>
        <span><strong>{schematic.buses.length}</strong><small>interfaces</small></span>
      </div>
      <div className="schematic-ready-card__buses">
        <Network size={13} />
        {schematic.buses.map((bus) => <code key={bus}>{bus}</code>)}
      </div>
    </Card>
  );
}

function ActiveConversation({ controller, compact = false }: { controller: WorkspaceController; compact?: boolean }) {
  const session = controller.session;
  const isLiveDraft = session.id.startsWith('draft-') || (session.origin === 'upload' && Boolean(session.objective));
  const isWaitingForGoal = session.origin === 'upload' && !session.objective;
  const isThinking = controller.workspacePhase === 'thinking';
  const hasFailure = session.status === 'failed' && session.evidence.length > 0;
  const hasPatch = Boolean(controller.currentPatch) || session.origin === 'example' && session.status === 'failed';
  return (
    <div className={cn('active-conversation', compact && 'active-conversation--compact')}>
      <div className="message-scroll">
        <div className="message-stream">
          <div className="conversation-date"><span>Today</span></div>
          {!isWaitingForGoal && (
            <MessageShell role="user">
              <p>{session.objective}</p>
              <div className="message-context"><FileText size={13} /> {session.origin === 'live' ? session.boardName : session.schematic.fileName}</div>
            </MessageShell>
          )}

          <MessageShell role="agent">
            <p>{isWaitingForGoal
              ? `Your virtual system is ready: ${session.schematic.componentCount} components, ${session.schematic.controllerCount} programmable controllers, and ${session.schematic.buses.length} interfaces. Tell me what firmware behavior you want to build or test.`
              : isLiveDraft
                ? isThinking
                  ? 'I’m checking that behavior against the hardware design now. You can follow how I’m scoping the change before any code is written.'
                  : 'The implementation plan is ready. I’m writing the affected firmware now, then I’ll build each image and verify the behavior in the complete system.'
                : hasFailure
                  ? 'I turned your request into a system check and kept it in place while I built and ran the firmware.'
                  : 'I traced the requested behavior through the hardware design, built each firmware image, and verified the complete system in simulation.'}</p>
            {isWaitingForGoal
              ? <SchematicReadyCard controller={controller} />
              : isThinking
                ? <ThinkingCard />
                : <ExecutionCard steps={session.steps} />}
          </MessageShell>

          {(hasFailure || hasPatch) && !isLiveDraft && (
            <>
              {hasFailure && <MessageShell role="agent">
                <p>The project built, but the requested behavior did not pass. I followed the runtime trace to the first incorrect write.</p>
                <RootCauseCard controller={controller} />
              </MessageShell>}
              {hasPatch && <MessageShell role="agent">
                <p>{session.origin === 'example' ? 'This sample shows how a proposed repair is reviewed.' : controller.currentPatch?.summary ?? 'A source repair is ready for review.'}</p>
                <PatchCard controller={controller} />
              </MessageShell>}
            </>
          )}
        </div>
      </div>
      <div className="conversation-composer-wrap">
        <ChatComposer controller={controller} />
        <small>Review generated changes before running them on physical hardware.</small>
      </div>
    </div>
  );
}

function CompactChatHeader({ controller }: { controller: WorkspaceController }) {
  return (
    <header className="compact-chat-header">
      <div><span className="agent-orb"><Sparkles size={14} /></span><span><strong>System chat</strong><small>{controller.session.schematic.fileName}</small></span></div>
    </header>
  );
}

export function ConversationCanvas({ controller, variant = 'full' }: { controller: WorkspaceController; variant?: 'full' | 'sidebar' }) {
  const compact = variant === 'sidebar';
  return (
    <main className={cn('conversation-canvas', compact && 'conversation-canvas--sidebar')}>
      {!controller.isDraft && (compact ? <CompactChatHeader controller={controller} /> : <WorkspaceHeader controller={controller} />)}
      {!compact && <TaskAttentionBar controller={controller} />}
      {controller.isDraft ? <NewTask controller={controller} /> : <ActiveConversation controller={controller} compact={compact} />}
    </main>
  );
}
