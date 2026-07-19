/**
 * Internal Backboard wire types. NEVER export these outside
 * backend/agent/adapters/backboard/ (enforced by architecture.test.ts).
 * Populated with verified shapes during the issue-01 spike.
 */
export interface WireAssistant { id: string; name?: string }
export interface WireThread { id: string; assistant_id?: string }
export interface WireMessage { id: string; role: string; content?: unknown }
