import { ArrowUp, AtSign, ChevronDown, FileText, Paperclip, Sparkles } from 'lucide-react';
import { Button } from '../../components/ui/button';
import type { WorkspaceController } from './use-workspace-controller';

interface ChatComposerProps {
  controller: WorkspaceController;
  large?: boolean;
}

export function ChatComposer({ controller, large = false }: ChatComposerProps) {
  const disabledReason = controller.isGuestDemo || controller.session.origin === 'example'
    ? 'Read-only sample — sign in to work with live tasks.'
    : 'Agent follow-up turns are not connected to the durable task runtime yet.';
  return (
    <div className={`composer ${large ? 'composer--large' : ''}`}>
      <textarea
        aria-label="Describe your task"
        placeholder={disabledReason}
        value={controller.composerValue}
        onChange={(event) => controller.setComposerValue(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            void controller.submitPrompt();
          }
        }}
        rows={large ? 3 : 2}
        disabled
        title={disabledReason}
      />
      {controller.submitError && <p className="composer__error">{controller.submitError}</p>}
      <div className="composer__toolbar">
        <div>
          <Button size="icon" variant="ghost" aria-label="Attachments are not connected yet" title="Not connected yet" disabled><Paperclip size={16} /></Button>
          {!large && <Button size="icon" variant="ghost" aria-label="Project mentions are not connected yet" title="Not connected yet" disabled><AtSign size={16} /></Button>}
          {!large && (
            <label className="composer-select">
              <Sparkles size={14} />
              <select aria-label="Agent mode" defaultValue="agent" disabled title="Agent mode selection is not connected yet">
                <option value="agent">Agent</option>
                <option value="ask">Ask</option>
                <option value="plan">Plan</option>
              </select>
              <ChevronDown size={12} />
            </label>
          )}
        </div>
        <div>
          <span className="composer-schematic" title={controller.session.schematic.fileName}>
            <FileText size={13} />
            <span>{controller.session.schematic.fileName}</span>
          </span>
          <Button
            size="icon"
            className="composer__send"
            aria-label="Send message"
            onClick={() => void controller.submitPrompt()}
            disabled
            title={disabledReason}
          >
            <ArrowUp size={17} />
          </Button>
        </div>
      </div>
    </div>
  );
}
