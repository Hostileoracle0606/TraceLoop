import { initTRPC, TRPCError } from '@trpc/server';
import { randomUUID } from 'node:crypto';
import { db } from '../db';
import { getUserFromJwt, type SupabaseUser } from '../supabase';
import { createChildLogger } from '../logger';
import type { Logger } from 'pino';
import { rateLimitMiddleware, createRateLimiter } from './middleware/rateLimit';

// Context type
export type Context = {
  db: typeof db;
  user: SupabaseUser | null;
  traceId: string;
  logger: Logger;
};

// Context creation function
export async function createContext(opts: { req: { headers: Record<string, string | string[] | undefined> } }): Promise<Context> {
  // Extract JWT from Authorization header
  const authHeader = opts.req.headers.authorization;
  const jwt = typeof authHeader === 'string' ? authHeader.replace('Bearer ', '') : null;
  
  // Get user from JWT (if present)
  const user = jwt ? await getUserFromJwt(jwt) : null;

  // Generate a unique trace ID for this request
  const traceId = randomUUID();
  const logger = createChildLogger({ traceId });

  return {
    db,
    user,
    traceId,
    logger,
  };
}

// Initialize tRPC
const t = initTRPC.context<Context>().create();

// Base router and procedure
export const router = t.router;
export const procedure = t.procedure;

// Rate limiter instance for authenticated procedures (100 req/min per user)
const authLimiter = createRateLimiter(60_000, 100);

// Authenticated procedure (requires user)
export const authenticatedProcedure = t.procedure.use(async ({ ctx, next }) => {
  if (!ctx.user) {
    throw new TRPCError({
      code: 'UNAUTHORIZED',
      message: 'You must be logged in to perform this action',
    });
  }
  return next({ ctx: { ...ctx, user: ctx.user } });
});

// Rate-limited procedure (applies rate limiting on top of auth)
export const rateLimitedProcedure = authenticatedProcedure.use(
  rateLimitMiddleware({ limiter: authLimiter })
);

// Admin procedure (requires admin role in user_metadata)
export const adminProcedure = authenticatedProcedure.use(async ({ ctx, next }) => {
  const role = ctx.user.user_metadata?.role;
  if (role !== 'admin') {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'Admin access required',
    });
  }
  return next();
});

// Ownership check middleware factory
export function requireOwnership<T extends { userId: string }>(
  getResource: (id: string, db: Context['db']) => Promise<T | null>,
  idParam: string = 'id'
) {
  return authenticatedProcedure.use(async ({ ctx, input, next }) => {
    const id = (input as unknown as Record<string, string>)?.[idParam];
    if (!id) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: `Missing ${idParam} parameter`,
      });
    }

    const resource = await getResource(id, ctx.db);
    if (!resource) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: 'Resource not found',
      });
    }

    if (resource.userId !== ctx.user!.id) {
      throw new TRPCError({
        code: 'FORBIDDEN',
        message: 'You do not have access to this resource',
      });
    }

    return next({ ctx: { ...ctx, user: ctx.user! } });
  });
}
