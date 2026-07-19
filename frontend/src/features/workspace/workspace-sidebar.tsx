import {
  Boxes,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  FileUp,
  FolderKanban,
  GitBranch,
  PanelLeftClose,
  Plus,
  Settings,
} from 'lucide-react';
import { Button } from '../../components/ui/button';
import { Separator } from '../../components/ui/separator';
import { cn } from '../../lib/utils';
import { Brand } from './brand';
import type { WorkspaceController } from './use-workspace-controller';

const statusClass = (status: string) => `conversation-status conversation-status--${status}`;

export function WorkspaceSidebar({ controller }: { controller: WorkspaceController }) {
  const { projects, conversations } = controller;
  const isRail = controller.sidebarCollapsed && !controller.sidebarOpen;
  return (
    <aside className={cn('workspace-sidebar', controller.sidebarOpen && 'is-open', isRail && 'is-collapsed')}>
      <header className="workspace-sidebar__header">
        <Brand compact={isRail} />
        {!isRail && (
          <Button className="desktop-only sidebar-collapse-button" variant="ghost" size="icon" aria-label="Collapse sidebar" onClick={controller.toggleSidebarCollapsed}>
            <ChevronLeft size={16} />
          </Button>
        )}
        <Button className="mobile-only" variant="ghost" size="icon" aria-label="Close sidebar" onClick={() => controller.setSidebarOpen(false)}>
          <PanelLeftClose size={17} />
        </Button>
      </header>

      <div className="workspace-sidebar__body">
        <Button className="new-task-button" data-testid="new-project" disabled title="Schematic import is not connected yet">
          <FileUp size={15} />
          Schematic import · later
        </Button>

        <nav className="primary-nav" aria-label="Workspace">
          <button className="is-active" data-testid="nav-agent" title="Projects">
            <FolderKanban size={16} />
            Projects
            <span>{conversations.length}</span>
          </button>
          <button className="visually-hidden" data-testid="nav-dashboard" onClick={() => controller.openConversation('demo-vehicle')}>Projects</button>
          <button className="visually-hidden" data-testid="nav-tests">Tests</button>
          <button className="visually-hidden" data-testid="nav-reports">Reports</button>
        </nav>

        <Separator />

        <section className="sidebar-section">
          <button className="sidebar-section__label">
            <span>Recent</span>
            <ChevronDown size={13} />
          </button>
          <div className="conversation-list">
            {conversations.map((conversation) => (
              <button
                key={conversation.id}
                className={cn('conversation-row', !controller.isDraft && conversation.id === controller.session.id && 'is-active')}
                onClick={() => controller.openConversation(conversation.id)}
              >
                <i className={statusClass(conversation.status)} />
                <span>
                  <strong>{conversation.title}</strong>
                  <small>{conversation.preview}</small>
                </span>
                <time>{conversation.updatedLabel}</time>
              </button>
            ))}
          </div>
        </section>

        <section className="sidebar-section projects-section">
          <div className="sidebar-section__label">
            <span>Projects</span>
            <button aria-label="Add project is not connected yet" title="Not connected yet" disabled><Plus size={13} /></button>
          </div>
          {projects.map((project) => (
            <button className="project-link" key={project.id} onClick={project.id.startsWith('demo-') ? () => controller.openConversation(project.controllers > 1 ? 'demo-vehicle' : 'demo-run-1042') : undefined} disabled={!project.id.startsWith('demo-')} title={project.id.startsWith('demo-') ? 'Open read-only sample' : 'Project task navigation is not connected yet'}>
              <Boxes size={14} />
              <span><strong>{project.name}</strong><small>{project.source} · {project.controllers} MCU{project.controllers === 1 ? '' : 's'}</small></span>
            </button>
          ))}
        </section>

        {isRail && (
          <Button className="desktop-only rail-expand-button" variant="ghost" size="icon" aria-label="Expand sidebar" onClick={controller.toggleSidebarCollapsed}>
            <ChevronRight size={16} />
          </Button>
        )}
      </div>

      <footer className="workspace-sidebar__footer">
        <button className="account-row" disabled title="Workspace settings are not connected yet">
          <span className="account-avatar">TG</span>
          <span><strong>Workspace</strong><small><GitBranch size={11} /> Git not connected</small></span>
          <Settings size={15} />
        </button>
      </footer>
    </aside>
  );
}
