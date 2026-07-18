import type { RunViewModel, Taxonomy } from './types';

/** Our internal taxonomy -> the dashboard's 'kind' vocabulary. */
const KIND: Record<Taxonomy, DashboardEvent['kind']> = {
  observed: 'observed',
  derived: 'derived',
  violated: 'failed',
};

/** The event shape the dashboard renders (note: UI 'kind' vocabulary, not our taxonomy). */
export interface DashboardEvent {
  time: number;
  label: string;
  lane: string;
  kind: 'observed' | 'derived' | 'failed';
  detail: string;
  register: string;
  value: string;
}

export interface RunMeta {
  id: string;
  commit: string;
  board: string;
  branch: string;
}

export interface DashboardRun {
  run: RunMeta & { status: 'pass' | 'fail' };
  events: Record<string, DashboardEvent>;
}

export function toDashboardRun(vm: RunViewModel, meta: RunMeta): DashboardRun {
  const events: Record<string, DashboardEvent> = {};
  for (const node of vm.chain) {
    events[node.id] = {
      time: node.time,
      label: node.label,
      lane: node.lane,
      kind: KIND[node.taxonomy],
      detail: node.detail,
      register: node.register,
      value: node.value,
    };
  }

  return {
    run: { ...meta, status: vm.status === 'failed' ? 'fail' : 'pass' },
    events,
  };
}
