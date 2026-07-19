import { LayoutPanelTop, MessageSquareText } from 'lucide-react';
import { cn } from '../../lib/utils';
import type { WorkspaceController } from './use-workspace-controller';

export function ModeSwitch({ controller }: { controller: WorkspaceController }) {
  return (
    <div className="mode-switch" role="group" aria-label="Workspace layout">
      <button
        className={cn(controller.layoutMode === 'chat' && 'is-active')}
        onClick={() => controller.setLayoutMode('chat')}
        aria-pressed={controller.layoutMode === 'chat'}
        title="Chat mode"
      >
        <MessageSquareText size={13} />
        <span>Chat</span>
      </button>
      <button
        className={cn(controller.layoutMode === 'workbench' && 'is-active')}
        onClick={() => controller.setLayoutMode('workbench')}
        aria-pressed={controller.layoutMode === 'workbench'}
        title="Workbench mode"
        disabled={!controller.canUseWorkbench}
      >
        <LayoutPanelTop size={13} />
        <span>{controller.canUseWorkbench ? 'Sample canvas' : 'Canvas later'}</span>
      </button>
    </div>
  );
}

export function RenodeStatus({ controller }: { controller: WorkspaceController }) {
  const offline = controller.systemStatus === 'Core services unavailable';
  const busy = controller.systemStatus === 'Checking systems';
  const checks = controller.health?.checks;
  return (
    <span className={cn('topbar-runtime', offline && 'is-offline', busy && 'is-busy')} title={checks ? `Database: ${checks.supabase} · Queue: ${checks.inngest}` : 'Live system health'}>
      <i />
      {controller.systemStatus}
    </span>
  );
}
