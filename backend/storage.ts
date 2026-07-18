import { createSupabaseAdminClient } from './supabase';

const ARTIFACTS_BUCKET = 'artifacts';

/**
 * Storage paths follow the pattern:
 *   {taskId}/{runId}/{filename}
 *
 * Example:
 *   abc-123/def-456/build.log
 *   abc-123/def-456/firmware.elf
 *   abc-123/def-456/trace.log
 */

/**
 * Upload an artifact to Supabase Storage.
 * Content can be a string (text) or Uint8Array (binary).
 */
export async function uploadArtifact(
  taskId: string,
  runId: string,
  filename: string,
  content: string | Uint8Array,
  contentType: string
): Promise<string> {
  const supabase = createSupabaseAdminClient();
  const path = `${taskId}/${runId}/${filename}`;

  const body = typeof content === 'string'
    ? new TextEncoder().encode(content)
    : content;

  const { error } = await supabase.storage
    .from(ARTIFACTS_BUCKET)
    .upload(path, body, {
      contentType,
      upsert: true,
    });

  if (error) {
    throw new Error(`Failed to upload artifact ${filename}: ${error.message}`);
  }

  return path;
}

/**
 * Get a signed download URL for an artifact.
 * URLs expire after the specified number of seconds (default: 1 hour).
 */
export async function getArtifactUrl(
  taskId: string,
  runId: string,
  filename: string,
  expiresIn: number = 3600
): Promise<string> {
  const supabase = createSupabaseAdminClient();
  const path = `${taskId}/${runId}/${filename}`;

  const { data, error } = await supabase.storage
    .from(ARTIFACTS_BUCKET)
    .createSignedUrl(path, expiresIn);

  if (error) {
    throw new Error(`Failed to get artifact URL: ${error.message}`);
  }

  return data.signedUrl;
}

/**
 * Download an artifact's content as text.
 */
export async function downloadArtifactText(
  taskId: string,
  runId: string,
  filename: string
): Promise<string> {
  const supabase = createSupabaseAdminClient();
  const path = `${taskId}/${runId}/${filename}`;

  const { data, error } = await supabase.storage
    .from(ARTIFACTS_BUCKET)
    .download(path);

  if (error) {
    throw new Error(`Failed to download artifact ${filename}: ${error.message}`);
  }

  if (!data) {
    throw new Error(`Artifact not found: ${path}`);
  }

  return data.text();
}

/**
 * Download an artifact's content as binary.
 */
export async function downloadArtifactBinary(
  taskId: string,
  runId: string,
  filename: string
): Promise<Uint8Array> {
  const supabase = createSupabaseAdminClient();
  const path = `${taskId}/${runId}/${filename}`;

  const { data, error } = await supabase.storage
    .from(ARTIFACTS_BUCKET)
    .download(path);

  if (error) {
    throw new Error(`Failed to download artifact ${filename}: ${error.message}`);
  }

  if (!data) {
    throw new Error(`Artifact not found: ${path}`);
  }

  return new Uint8Array(await data.arrayBuffer());
}

/**
 * List all artifacts for a given run.
 */
export async function listRunArtifacts(
  taskId: string,
  runId: string
): Promise<Array<{ name: string; size: number; created_at: string }>> {
  const supabase = createSupabaseAdminClient();
  const prefix = `${taskId}/${runId}`;

  const { data, error } = await supabase.storage
    .from(ARTIFACTS_BUCKET)
    .list(prefix);

  if (error) {
    throw new Error(`Failed to list artifacts: ${error.message}`);
  }

  return (data ?? []).map((file) => ({
    name: file.name,
    size: file.metadata?.size ?? 0,
    created_at: file.created_at ?? '',
  }));
}

/**
 * Delete all artifacts for a run (cleanup).
 */
export async function deleteRunArtifacts(
  taskId: string,
  runId: string
): Promise<void> {
  const supabase = createSupabaseAdminClient();
  const prefix = `${taskId}/${runId}`;

  // List all files first
  const files = await listRunArtifacts(taskId, runId);
  if (files.length === 0) return;

  const paths = files.map((f) => `${prefix}/${f.name}`);

  const { error } = await supabase.storage
    .from(ARTIFACTS_BUCKET)
    .remove(paths);

  if (error) {
    throw new Error(`Failed to delete artifacts: ${error.message}`);
  }
}
