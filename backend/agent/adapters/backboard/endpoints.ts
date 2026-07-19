/**
 * Single endpoint table. Paths are derived from docs.backboard.io as of
 * 2026-07-18 and are PROVISIONAL until the live spike (issue 01) verifies
 * them. Amend here only — no inline paths anywhere else.
 */
export const ENDPOINTS = {
  models: '/models',
  assistants: '/assistants',
  assistant: (id: string) => `/assistants/${id}`,
  threads: '/threads',
  thread: (id: string) => `/threads/${id}`,
  threadMessages: (id: string) => `/threads/${id}/messages`,
  threadRuns: (id: string) => `/threads/${id}/runs`,
  run: (threadId: string, runId: string) => `/threads/${threadId}/runs/${runId}`,
  submitToolOutputs: (threadId: string, runId: string) => `/threads/${threadId}/runs/${runId}/tool-outputs`,
  cancelRun: (threadId: string, runId: string) => `/threads/${threadId}/runs/${runId}/cancel`,
  memories: '/memories',
  memory: (id: string) => `/memories/${id}`,
  documents: '/documents',
  document: (id: string) => `/documents/${id}`,
} as const;
