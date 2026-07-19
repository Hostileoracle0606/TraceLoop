import { useEffect } from 'react';
import { cn } from '../../lib/utils';
import { ContextInspector } from './context-inspector';
import { ConversationCanvas } from './conversation-canvas';
import { useWorkspaceController } from './use-workspace-controller';
import { WorkbenchCanvas } from './workbench-canvas';
import { WorkspaceSidebar } from './workspace-sidebar';

export function WorkspaceApp() {
  const controller = useWorkspaceController();

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        controller.setSidebarOpen(false);
        controller.setInspectorOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [controller]);

  return (
    <div className={cn(
      'workspace-shell',
      controller.isDraft && 'workspace-shell--draft',
      !controller.isDraft && controller.layoutMode === 'workbench' && 'workspace-shell--workbench',
      !controller.isDraft && controller.layoutMode === 'workbench' && controller.workspacePhase === 'building' && 'workspace-shell--preview-only',
      !controller.isDraft && controller.layoutMode === 'workbench' && controller.workspacePhase !== 'building' && 'workspace-shell--split-ready',
      !controller.isDraft && controller.sidebarCollapsed && 'workspace-shell--sidebar-collapsed',
    )}>
      {!controller.isDraft && <WorkspaceSidebar controller={controller} />}
      {!controller.isDraft && controller.sidebarOpen && <button className="workspace-backdrop" aria-label="Close sidebar" onClick={() => controller.setSidebarOpen(false)} />}
      {controller.layoutMode === 'chat' && <ConversationCanvas controller={controller} />}
      {!controller.isDraft && controller.layoutMode === 'workbench' && <WorkbenchCanvas controller={controller} />}
      {!controller.isDraft && controller.layoutMode === 'workbench' && controller.workspacePhase !== 'building' && <ConversationCanvas controller={controller} variant="sidebar" />}
      {!controller.isDraft && controller.layoutMode === 'chat' && <ContextInspector controller={controller} />}
      {!controller.isDraft && controller.inspectorOpen && controller.layoutMode === 'chat' && <button className="inspector-backdrop" aria-label="Close context inspector" onClick={() => controller.setInspectorOpen(false)} />}
    </div>
  );
}
