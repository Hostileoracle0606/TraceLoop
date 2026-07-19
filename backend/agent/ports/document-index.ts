export interface DocumentSyncRequest { projectId: string; name: string; content: string; version: string }
export interface DocumentSyncResult { externalId: string; indexingState: 'pending' | 'indexed' | 'failed' }
export interface DocumentDeleteRequest { externalId: string }

export interface KnowledgeDocumentIndex {
  synchronize(input: DocumentSyncRequest): Promise<DocumentSyncResult>;
  delete(input: DocumentDeleteRequest): Promise<void>;
}
