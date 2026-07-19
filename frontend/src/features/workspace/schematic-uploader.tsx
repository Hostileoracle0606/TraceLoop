import { ArrowRight, CircuitBoard, FolderOpen, LockKeyhole } from 'lucide-react';
import { Button } from '../../components/ui/button';
import type { WorkspaceController } from './use-workspace-controller';

export function SchematicUploader({ controller }: { controller: WorkspaceController }) {
  return (
    <div className="schematic-entry">
      <div className="schematic-dropzone is-disabled" aria-label="Schematic upload is not connected yet">
        <span className="schematic-dropzone__icon"><LockKeyhole size={22} /></span>
        <h2>Schematic upload · coming later</h2>
        <p>The parser, hardware mapping, and editable system canvas are not part of the current live workflow.</p>
        <Button size="lg" disabled title="Not connected yet"><FolderOpen size={16} /> Choose schematic</Button>
        <small>Not connected yet — no local file will be read or uploaded.</small>
      </div>

      <div className="schematic-examples">
        <span><CircuitBoard size={13} /> Explore a clearly labeled read-only sample</span>
        <div>
          <button onClick={() => controller.openConversation('demo-vehicle')}>Vehicle gateway sample <ArrowRight size={12} /></button>
          <button onClick={() => controller.openConversation('demo-run-1042')}>Timer LED sample <ArrowRight size={12} /></button>
        </div>
      </div>
    </div>
  );
}
