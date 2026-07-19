export type WorkspaceMode = 'chat' | 'workbench';
export type InspectorTab = 'code' | 'schematic' | 'evidence';
export type ConversationStatus = 'active' | 'failed' | 'passed' | 'draft';

export interface ProjectSummary {
  id: string;
  name: string;
  source: string;
  controllers: number;
  updatedLabel: string;
}

export interface BoardSummary {
  id: string;
  name: string;
  mcu: string;
  architecture: string;
  peripherals: string[];
  status: string;
  targetType?: 'mcu' | 'system';
  description?: string;
  nodes?: TargetNode[];
  links?: TargetLink[];
}

export interface TargetNode {
  id: string;
  name: string;
  mcu: string;
  role: string;
  firmware?: string;
}

export interface TargetLink {
  id: string;
  source: string;
  target: string;
  protocol: string;
}

export type SchematicNodeKind = 'sensor' | 'controller' | 'radio' | 'service' | 'peripheral';

export interface SchematicNode {
  id: string;
  reference: string;
  name: string;
  detail: string;
  kind: SchematicNodeKind;
  firmware?: string;
}

export interface SchematicLink {
  id: string;
  source: string;
  target: string;
  protocol: string;
}

export interface SchematicSummary {
  id: string;
  fileName: string;
  displayName: string;
  format: string;
  fileSize: string;
  componentCount: number;
  controllerCount: number;
  buses: string[];
  nodes: SchematicNode[];
  links: SchematicLink[];
}

export interface ConversationSummary {
  id: string;
  projectId: string;
  title: string;
  preview: string;
  status: ConversationStatus;
  updatedLabel: string;
}

export interface ActivityStep {
  id: string;
  label: string;
  detail: string;
  state: 'complete' | 'active' | 'waiting' | 'failed';
  duration?: string;
}

export interface EvidenceEvent {
  id: string;
  time: number;
  label: string;
  detail: string;
  register: string;
  value: string;
  tone: 'neutral' | 'violet' | 'amber' | 'red';
}

export interface WorkspaceSession {
  id: string;
  title: string;
  objective: string;
  projectName: string;
  boardName: string;
  origin: 'example' | 'upload' | 'live';
  schematic: SchematicSummary;
  branch: string;
  status: ConversationStatus;
  iteration: number;
  permission: string;
  files: Record<string, string>;
  activeFile: string;
  steps: ActivityStep[];
  evidence: EvidenceEvent[];
  testSummary: {
    passed: number;
    total: number;
    assertion: string;
    expected: string;
    observed: string;
  };
}
