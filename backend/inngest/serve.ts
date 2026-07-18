import { serve } from 'inngest/node';
import { inngest } from './client';
import { functions } from './functions';

/**
 * Inngest serve handler for Node.js.
 *
 * Returns an http.RequestListener that Inngest (or the Inngest Dev Server)
 * calls to execute functions. Mount it at /api/inngest in your server.
 *
 * In development, the Inngest Dev Server polls this endpoint to discover
 * and execute functions. In production, Inngest Cloud calls it.
 */
export const inngestHandler = serve({
  client: inngest,
  functions,
});
