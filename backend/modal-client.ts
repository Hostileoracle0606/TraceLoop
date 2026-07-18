import { getModalEndpoint } from './config';
import { db } from './db';
import { boards } from './db/schema';
import { eq } from 'drizzle-orm';

/**
 * Client for the Modal compute plane.
 * Modal exposes a single `firmware_job` endpoint that handles
 * build + simulate in one call.
 */

export interface FirmwareJobRequest {
  files: Record<string, string>;
  board: string; // Zephyr board slug like 'stm32f4_disco', NOT a UUID
}

export interface FirmwareJobResult {
  build: { ok: boolean; log: string };
  trace?: { log: string }; // only present if build.ok
}

class ModalClient {
  private getEndpoint(): string {
    const endpoint = getModalEndpoint();
    if (!endpoint) {
      throw new Error('MODAL_ENDPOINT not configured');
    }
    return endpoint;
  }

  async firmwareJob(request: FirmwareJobRequest): Promise<FirmwareJobResult> {
    const response = await fetch(`${this.getEndpoint()}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Firmware job failed (${response.status}): ${text}`);
    }

    return response.json() as Promise<FirmwareJobResult>;
  }
}

// Singleton client
export const modalClient = new ModalClient();

// Cache for board slug lookups
const boardSlugCache = new Map<string, string>();

/**
 * Resolve a board UUID (or slug) to a Zephyr board slug.
 * If the input already looks like a slug (contains '_' or no '-'), it is returned as-is.
 */
export async function resolveBoardSlug(boardIdOrSlug: string): Promise<string> {
  // If it's already a slug (no dashes / looks like a Zephyr target), return as-is
  if (!boardIdOrSlug.includes('-') || boardIdOrSlug.includes('_')) {
    return boardIdOrSlug;
  }

  // Check cache
  const cached = boardSlugCache.get(boardIdOrSlug);
  if (cached) return cached;

  // Look up in DB
  const board = await db.query.boards.findFirst({
    where: eq(boards.id, boardIdOrSlug),
  });

  if (!board) {
    throw new Error(`Board not found: ${boardIdOrSlug}`);
  }

  boardSlugCache.set(boardIdOrSlug, board.buildTarget);
  return board.buildTarget;
}
