export interface MemorySearch { projectId: string; query: string; limit?: number }
export interface MemoryResult { externalId: string; content: string; score?: number }
export interface ValidatedMemory { projectId: string; content: string; sourceEvidenceRefs: string[] }
export interface MemoryUpdate { externalId: string; content: string }
export interface MemoryDelete { externalId: string }

export interface SemanticMemoryStore {
  search(input: MemorySearch): Promise<MemoryResult[]>;
  add(input: ValidatedMemory): Promise<{ externalId: string }>;
  update(input: MemoryUpdate): Promise<void>;
  delete(input: MemoryDelete): Promise<void>;
}
