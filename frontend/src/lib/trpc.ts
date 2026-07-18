import { createTRPCReact, httpBatchLink } from '@trpc/react-query';
import type { AppRouter } from '@backend/trpc/router';

// Typed tRPC React Query hooks
export const trpc = createTRPCReact<AppRouter>();

// Create tRPC client instance (used by the provider)
export function createTrpcClient() {
  return trpc.createClient({
    links: [
      httpBatchLink({
        url: import.meta.env.VITE_TRPC_URL ?? 'http://localhost:3000/trpc',
      }),
    ],
  });
}
